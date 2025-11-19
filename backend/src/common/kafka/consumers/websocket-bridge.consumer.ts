import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../kafka.config';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';

/**
 * WebSocket Bridge Consumer
 * Consumes websocket.notifications topic and emits events to connected clients
 *
 * This bridges Kafka messages to Socket.IO for real-time frontend updates
 */
@Controller()
export class WebSocketBridgeConsumer {
  private readonly logger = new Logger(WebSocketBridgeConsumer.name);

  constructor(private websocketGateway: WebsocketGateway) {}

  @MessagePattern(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS)
  async handleMessage(@Payload() message: any, @Ctx() context: KafkaContext): Promise<void> {
    try {
      const notification = message;

      if (!notification.userId) {
        this.logger.warn(
          `Notification missing userId - cannot route to user room: ${notification.type}`,
        );
        return;
      }

      this.logger.log(
        `📢 Sending notification to user ${notification.userId}: ${notification.type} for conversation ${notification.conversationId}`,
      );

      // Route notification to appropriate WebSocket event
      switch (notification.type) {
        case 'new_message':
          await this.handleNewMessage(notification);
          break;

        case 'message_status':
          await this.handleMessageStatus(notification);
          break;

        case 'conversation_updated':
          await this.handleConversationUpdated(notification);
          break;

        default:
          this.logger.warn(`Unknown notification type: ${notification.type}`);
      }
    } catch (error) {
      this.logger.error('Failed to process WebSocket notification:', error);
      // Don't throw - continue processing other messages
    }
  }

  /**
   * Handle new message notification
   * Emits to user-specific room instead of conversation room
   */
  private async handleNewMessage(notification: any): Promise<void> {
    const { userId, conversationId, payload } = notification;

    // Emit new message to user-specific room
    this.websocketGateway.emitNewMessage(userId, payload.message);

    // Also emit conversation update to refresh conversation list
    this.websocketGateway.emitConversationUpdated(userId, payload.conversation);

    this.logger.debug(`✅ Emitted new message for user ${userId} (conversation ${conversationId})`);
  }

  /**
   * Handle message status update
   * Emits to user-specific room instead of conversation room
   */
  private async handleMessageStatus(notification: any): Promise<void> {
    const { userId, conversationId, payload } = notification;

    this.websocketGateway.emitMessageStatus(
      userId,
      conversationId,
      payload.messageId,
      payload.status,
    );

    this.logger.debug(`✅ Emitted status update for user ${userId} (message ${payload.messageId})`);
  }

  /**
   * Handle conversation update
   * Emits to user-specific room instead of broadcasting
   */
  private async handleConversationUpdated(notification: any): Promise<void> {
    const { userId, payload } = notification;

    this.websocketGateway.emitConversationUpdated(userId, payload.conversation);

    this.logger.debug(`✅ Emitted conversation update for user ${userId} (conversation ${payload.conversation._id})`);
  }
}
