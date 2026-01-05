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
    const target = event.organizationId ? `org ${event.organizationId}` : `user ${event.userId}`;
    this.logger.log(`📨 Kafka → WebSocket: ${event.type} for ${target}`);

    try {
      const { type, userId, organizationId, payload } = event;

      switch (type) {
        case 'message:new':
          const msgPayload = payload as NewMessagePayload;
          const messageData = {
            conversationId: msgPayload.conversationId,
            message: msgPayload,
          };
          // Broadcast to org agents if organizationId provided, otherwise to specific user
          if (organizationId) {
            this.websocketGateway.emitToOrgAgents(organizationId, 'message:new', messageData);
          } else if (userId) {
            this.websocketGateway.emitNewMessage(userId, messageData);
          }
          break;

        case 'message:status':
          const statusPayload = payload as MessageStatusPayload;
          if (userId) {
            this.websocketGateway.emitMessageStatus(
              userId,
              statusPayload.conversationId,
              statusPayload.messageId,
              statusPayload.status,
            );
          }
          break;

        case 'conversation:updated':
          if (organizationId) {
            this.websocketGateway.emitToOrgAgents(organizationId, 'conversation:updated', payload);
          } else if (userId) {
            this.websocketGateway.emitConversationUpdated(userId, payload as ConversationUpdatedPayload);
          }
          break;

        case 'message:read':
          const readPayload = payload as MessagesReadPayload;
          if (organizationId) {
            this.websocketGateway.emitToOrgAgents(organizationId, 'message:read', readPayload);
          } else if (userId) {
            this.websocketGateway.emitMessagesRead(
              userId,
              readPayload.conversationId,
              readPayload.messageIds,
            );
          }
          break;

        default:
          this.logger.warn(`Unknown notification type: ${type}`);
      }

      this.logger.log(`✅ Emitted ${type} to ${target}`);
    } catch (error) {
      this.logger.error(`❌ Failed to emit WebSocket notification:`, error);
    }
  }
}
