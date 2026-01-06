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
import { Injectable, Logger } from '@nestjs/common';
import { KeycloakTokenService } from '@/modules/auth/services/keycloak-token.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    // Note: Decorator config evaluated at module load time, before DI available
    // Using process.env here is acceptable for initialization-time configuration
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(private keycloakTokenService: KeycloakTokenService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        client.disconnect();
        return;
      }

      // Validate Keycloak JWT token using RS256 + JWKS
      const payload = await this.keycloakTokenService.verifyToken(token);

      client.userId = payload.sub;

      // Join user-specific room
      client.join(`user:${client.userId}`);

      this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);
    } catch (error) {
      this.logger.error('Authentication failed:', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:conversation')
  handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.join(`conversation:${conversationId}`);
    this.logger.log(
      `User ${client.userId} joined conversation ${conversationId}`,
    );
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.leave(`conversation:${conversationId}`);
    this.logger.log(
      `User ${client.userId} left conversation ${conversationId}`,
    );
  }

  /**
   * Join agent to org's agent room
   * Called when agent opens conversations list to receive visitor events
   */
  @SubscribeMessage('join:org:agents')
  async handleJoinOrgAgents(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { organizationId: string },
  ) {
    const { organizationId } = data;
    const room = `org:${organizationId}:agents`;

    // Remove other sockets of same user from room to prevent duplicates
    const existingSockets = await this.server.in(room).fetchSockets();
    for (const socket of existingSockets) {
      const authSocket = socket as unknown as AuthenticatedSocket;
      if (authSocket.userId === client.userId && socket.id !== client.id) {
        socket.leave(room);
        this.logger.log(`Removed duplicate socket ${socket.id} for user ${client.userId} from ${room}`);
      }
    }

    client.join(room);
    const sockets = await this.server.in(room).fetchSockets();
    this.logger.log(`✅ Agent ${client.userId} joined ${room} (total: ${sockets.length} clients)`);

    // Return acknowledgment to client
    return { success: true, room, clientCount: sockets.length };
  }

  @SubscribeMessage('leave:org:agents')
  handleLeaveOrgAgents(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { organizationId: string },
  ) {
    const { organizationId } = data;
    client.leave(`org:${organizationId}:agents`);
    this.logger.log(`Agent ${client.userId} left org:${organizationId}:agents`);
  }

  // Emit methods for backend services to call
  // All events are sent to specific user rooms based on userId
  emitToUser(userId: string, event: string, data: any) {
    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit(event, data);
    this.logger.log(`📤 Emitted ${event} to user ${userId}`);
  }

  emitNewMessage(userId: string, message: any) {
    this.emitToUser(userId, 'message:new', message);
  }

  emitMessageStatus(userId: string, conversationId: string, messageId: string, status: string) {
    this.emitToUser(userId, 'message:status', {
      conversationId,
      messageId,
      status,
    });
  }

  emitConversationUpdated(userId: string, conversation: any) {
    this.emitToUser(userId, 'conversation:updated', conversation);
  }

  emitMessagesRead(userId: string, conversationId: string, messageIds: string[]) {
    this.emitToUser(userId, 'message:read', {
      conversationId,
      messageIds,
    });
  }

  /**
   * Emit to all agents in an organization
   * Used for broadcasting new conversations/messages from visitors
   */
  async emitToOrgAgents(organizationId: string, event: string, data: any) {
    const room = `org:${organizationId}:agents`;
    const sockets = await this.server.in(room).fetchSockets();
    this.logger.log(`📤 Emitting ${event} to ${room} (${sockets.length} clients), orgId: "${organizationId}"`);
    if (sockets.length === 0) {
      this.logger.warn(`⚠️ No clients in room ${room} - check if FE joined with correct orgId`);
    }
    this.server.to(room).emit(event, data);
  }
}
