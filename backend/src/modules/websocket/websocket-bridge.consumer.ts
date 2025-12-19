import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  MessageStatusPayload,
  ConversationUpdatedPayload,
  MessagesReadPayload,
} from '@/infra/kafka/types/webhook.types';
import { WebsocketGateway } from './websocket.gateway';

/**
 * WebSocket Bridge Consumer
 *
 * Consumes notifications from Kafka and emits them to WebSocket clients.
 * Topic: websocket.notifications (partitioned by userId)
 *
 * Architecture:
 * 1. Services publish events to Kafka topic 'websocket.notifications'
 * 2. This consumer receives events and emits to Socket.IO
 * 3. Frontend clients subscribed to user-specific rooms receive events
 */
@Controller()
export class WebSocketBridgeConsumer {
  private readonly logger = new Logger(WebSocketBridgeConsumer.name);

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  @MessagePattern(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS)
  async handleNotification(@Payload() event: WebSocketNotificationEvent): Promise<void> {
    this.logger.log(`📨 Kafka → WebSocket: ${event.type} for user ${event.userId}`);

    try {
      const { type, userId, payload } = event;

      switch (type) {
        case 'message:new':
          // FIX: Wrap payload in {conversationId, message} format expected by frontend
          const msgPayload = payload as NewMessagePayload;
          this.websocketGateway.emitNewMessage(userId, {
            conversationId: msgPayload.conversationId,
            message: msgPayload,
          });
          break;

        case 'message:status':
          const statusPayload = payload as MessageStatusPayload;
          this.websocketGateway.emitMessageStatus(
            userId,
            statusPayload.conversationId,
            statusPayload.messageId,
            statusPayload.status,
          );
          break;

        case 'conversation:updated':
          this.websocketGateway.emitConversationUpdated(userId, payload as ConversationUpdatedPayload);
          break;

        case 'message:read':
          const readPayload = payload as MessagesReadPayload;
          this.websocketGateway.emitMessagesRead(
            userId,
            readPayload.conversationId,
            readPayload.messageIds,
          );
          break;

        case 'typing:indicator':
          // Typing indicators are handled directly by WebSocket (not via Kafka)
          this.logger.debug('Typing indicator event - skipping (handled directly)');
          break;

        default:
          this.logger.warn(`Unknown notification type: ${type}`);
      }

      this.logger.log(`✅ Emitted ${type} to user ${userId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to emit WebSocket notification:`, error);
    }
  }
}
