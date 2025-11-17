import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { getKafkaConfig, KAFKA_TOPICS, KAFKA_CONSUMER_GROUPS } from '../kafka.config';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';

/**
 * WebSocket Bridge Consumer
 * Consumes websocket.notifications topic and emits events to connected clients
 *
 * This bridges Kafka messages to Socket.IO for real-time frontend updates
 */
@Injectable()
export class WebSocketBridgeConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketBridgeConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private websocketGateway: WebsocketGateway) {}

  async onModuleInit() {
    const config = getKafkaConfig();
    this.kafka = new Kafka(config);
    this.consumer = this.kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.WEBSOCKET_BRIDGE,
    });

    try {
      await this.consumer.connect();
      this.logger.log('✅ WebSocket Bridge Consumer connected');

      await this.consumer.subscribe({
        topic: KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log(`🌉 WebSocket Bridge listening to: ${KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS}`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize WebSocket Bridge Consumer:', error);
      // Don't throw - allow app to start even if Kafka is down
    }
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.logger.log('WebSocket Bridge Consumer disconnected');
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;

    try {
      const notification = JSON.parse(message.value?.toString() || '{}');

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
