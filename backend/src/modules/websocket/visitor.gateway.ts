import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UsePipes, ValidationPipe, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { VisitorMessageService } from './visitor-message.service';
import { VisitorRateLimitService } from './visitor-rate-limit.service';
import { SendVisitorMessageDto, PreChatFormDto } from './dto';

export interface VisitorSocket extends Socket {
  sessionId?: string;
  organizationId?: string;
  visitorName?: string;
  visitorEmail?: string;
}

interface VisitorHandshake {
  sessionId: string;
  organizationId: string;
  name?: string;
  email?: string;
}

@Injectable()
@WebSocketGateway({
  namespace: '/visitor',
  cors: {
    origin: (origin, callback) => {
      // Allow all origins - validation done in handleConnection
      // This enables widget to work on any customer website
      // TODO: Implement origin validation against org.allowedOrigins for CSWSH prevention
      callback(null, true);
    },
    credentials: true,
  },
  // Limit message payload size to prevent DoS
  maxHttpBufferSize: 100_000, // 100KB
})
export class VisitorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VisitorGateway.name);

  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<OrganizationDocument>,
    @Inject(forwardRef(() => VisitorMessageService))
    private readonly visitorMessageService: VisitorMessageService,
    private readonly rateLimitService: VisitorRateLimitService,
  ) {}

  async handleConnection(client: VisitorSocket) {
    try {
      const auth = client.handshake.auth as VisitorHandshake;
      const origin = client.handshake.headers.origin;
      const ip =
        client.handshake.headers['x-forwarded-for']?.toString() ||
        client.handshake.address;

      // Rate limit check
      const allowed = await this.rateLimitService.checkConnectionLimit(ip);
      if (!allowed) {
        this.logger.warn(`Visitor rejected: Rate limit exceeded for IP ${ip}`);
        client.emit('error', {
          code: 'RATE_LIMITED',
          message: 'Too many connections. Please try again later.',
        });
        client.disconnect();
        return;
      }

      // Validate required fields
      if (!auth.sessionId || !auth.organizationId) {
        this.logger.warn(`Visitor rejected: Missing sessionId or organizationId`);
        client.emit('error', {
          code: 'AUTH_REQUIRED',
          message: 'Session ID and Organization ID required',
        });
        client.disconnect();
        return;
      }

      // Validate organization exists and is active
      const org = await this.organizationModel.findOne({
        _id: auth.organizationId,
        isActive: true,
      });

      if (!org) {
        this.logger.warn(
          `Visitor rejected: Invalid organization ${auth.organizationId}`,
        );
        client.emit('error', {
          code: 'ORG_NOT_FOUND',
          message: 'Organization not found',
        });
        client.disconnect();
        return;
      }

      // Origin validation (CSWSH prevention)
      // In production, validate against org's allowed domains
      // For now, log the origin for monitoring
      this.logger.log(`Visitor connection from origin: ${origin}`);

      // Attach metadata to socket
      client.sessionId = auth.sessionId;
      client.organizationId = auth.organizationId;
      client.visitorName = auth.name || 'Visitor';
      client.visitorEmail = auth.email;

      // Join rooms
      client.join(`visitor:${auth.sessionId}`);
      client.join(`org:${auth.organizationId}:visitors`);

      // Notify visitor of successful connection
      client.emit('connected', {
        sessionId: auth.sessionId,
        organizationId: auth.organizationId,
      });

      this.logger.log(
        `Visitor connected: ${client.id} (session: ${auth.sessionId}, org: ${auth.organizationId})`,
      );

      // Load existing conversation if any
      const existingConversation =
        await this.visitorMessageService.getExistingConversation(
          auth.organizationId,
          auth.sessionId,
        );

      if (existingConversation) {
        client.emit('conversation:restored', {
          conversationId: existingConversation._id,
          messages: existingConversation.messages,
        });
      }
    } catch (error) {
      this.logger.error('Visitor connection error:', error.message);
      client.emit('error', {
        code: 'CONNECTION_ERROR',
        message: 'Connection failed',
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: VisitorSocket) {
    this.logger.log(
      `Visitor disconnected: ${client.id} (session: ${client.sessionId})`,
    );
  }

  // ==================== Message Handlers ====================

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() client: VisitorSocket,
    @MessageBody() data: SendVisitorMessageDto,
  ) {
    if (!client.sessionId || !client.organizationId) {
      client.emit('error', { code: 'NOT_AUTHENTICATED' });
      return;
    }

    // Message rate limit check
    const allowed = await this.rateLimitService.checkMessageLimit(
      client.sessionId,
    );
    if (!allowed) {
      client.emit('error', {
        code: 'MESSAGE_RATE_LIMITED',
        message: 'Too many messages. Please slow down.',
      });
      return;
    }

    try {
      const result = await this.visitorMessageService.processVisitorMessage({
        sessionId: client.sessionId,
        organizationId: client.organizationId,
        visitorName: client.visitorName,
        visitorEmail: client.visitorEmail,
        text: data.text,
        type: data.type,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
      });

      // Confirm to visitor
      client.emit('message:sent', {
        messageId: result.messageId,
        conversationId: result.conversationId,
        timestamp: result.timestamp,
      });

      // Message to agent handled by visitorMessageService via WebsocketGateway
    } catch (error) {
      this.logger.error('Message send error:', error.message, error.stack);
      client.emit('message:error', {
        error: 'Failed to send message',
      });
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('pre-chat:submit')
  async handlePreChatSubmit(
    @ConnectedSocket() client: VisitorSocket,
    @MessageBody() data: PreChatFormDto,
  ) {
    if (!client.sessionId || !client.organizationId) return;

    // Update socket metadata
    if (data.name) client.visitorName = data.name;
    if (data.email) client.visitorEmail = data.email;

    // Store visitor info
    await this.visitorMessageService.updateVisitorInfo(
      client.organizationId,
      client.sessionId,
      data,
    );

    client.emit('pre-chat:saved');
  }

  // ==================== Emit Methods (called by services) ====================

  /**
   * Send message to visitor
   * Called when agent sends reply
   */
  emitToVisitor(sessionId: string, event: string, data: any) {
    const room = `visitor:${sessionId}`;
    const sockets = this.server.sockets;

    // Debug: Check if room has any sockets
    this.server.in(room).fetchSockets().then((socketsInRoom) => {
      this.logger.debug(
        `emitToVisitor: room=${room}, socketsInRoom=${socketsInRoom.length}, event=${event}`,
      );
    });

    this.server.to(room).emit(event, data);
    this.logger.log(`📤 Emitted ${event} to visitor room ${room}`);
  }

  /**
   * Send message to all visitors of an org
   * E.g., broadcast org going offline
   */
  emitToOrgVisitors(organizationId: string, event: string, data: any) {
    this.server.to(`org:${organizationId}:visitors`).emit(event, data);
  }
}
