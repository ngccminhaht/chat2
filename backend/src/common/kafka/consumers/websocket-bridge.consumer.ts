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

      this.logger.log(
        `📢 Broadcasting notification: ${notification.type} for conversation ${notification.conversationId}`,
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
   */
  private async handleNewMessage(notification: any): Promise<void> {
    const { conversationId, payload } = notification;

    // Emit to conversation room
    this.websocketGateway.server
      .to(`conversation:${conversationId}`)
      .emit('message:new', payload.message);

    // Also emit conversation update to all clients
    this.websocketGateway.server.emit('conversation:updated', payload.conversation);

    this.logger.debug(`✅ Emitted new message for conversation ${conversationId}`);
  }

  /**
   * Handle message status update
   */
  private async handleMessageStatus(notification: any): Promise<void> {
    const { conversationId, payload } = notification;

    this.websocketGateway.server
      .to(`conversation:${conversationId}`)
      .emit('message:status', {
        messageId: payload.messageId,
        status: payload.status,
      });

    this.logger.debug(`✅ Emitted status update for message ${payload.messageId}`);
  }

  /**
   * Handle conversation update
   */
  private async handleConversationUpdated(notification: any): Promise<void> {
    const { payload } = notification;

    this.websocketGateway.server.emit('conversation:updated', payload.conversation);

    this.logger.debug(`✅ Emitted conversation update ${payload.conversation._id}`);
  }
}
