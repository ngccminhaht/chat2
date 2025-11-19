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
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
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

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'default-secret',
      });

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

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.to(`conversation:${conversationId}`).emit('typing:indicator', {
      conversationId,
      userId: client.userId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.to(`conversation:${conversationId}`).emit('typing:indicator', {
      conversationId,
      userId: client.userId,
      isTyping: false,
    });
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
}
