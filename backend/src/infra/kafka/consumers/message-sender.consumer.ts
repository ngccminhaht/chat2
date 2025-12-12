/**
 * Message Sender Consumer
 * Consumes outgoing messages from Kafka and sends them via platform adapters
 *
 * Topic: messages.outgoing
 * Consumer Group: message-sender-group
 */

import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../kafka.config';
import { OutgoingMessageEvent } from '../types/webhook.types';
import { Platform, MessageStatus, MessageType } from '@/common/constants';
import { PlatformRegistry } from '@/modules/platforms/core/services/platform.registry';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { KafkaProducerService } from '../kafka-producer.service';
import {
  WebSocketNotificationEvent,
  MessageStatusPayload,
} from '../types/webhook.types';

@Controller()
export class MessageSenderConsumer {
  private readonly logger = new Logger(MessageSenderConsumer.name);

  constructor(
    private readonly platformRegistry: PlatformRegistry,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @MessagePattern(KAFKA_TOPICS.MESSAGES_OUTGOING)
  async handleOutgoingMessage(@Payload() event: OutgoingMessageEvent): Promise<void> {
    this.logger.log(
      `📤 Processing outgoing message: ${event.messageId} to ${event.platform}`,
    );

    try {
      // 1. Get platform adapter
      const adapter = this.platformRegistry.get(event.platform);

      // 2. Get platform connection for credentials
      const connection = await this.platformConnectionModel
        .findById(event.platformConnectionId)
        .exec();

      if (!connection) {
        this.logger.error(`Connection not found: ${event.platformConnectionId}`);
        await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, 'Connection not found');
        return;
      }

      // 3. Format outbound message using adapter
      const outboundMessage = {
        type: event.message.type,
        content: {
          text: event.message.text,
          mediaUrl: event.message.mediaUrl,
          mediaType: event.message.mediaType,
          fileName: event.message.fileName,
        },
      };
      const platformPayload = adapter.formatOutbound(outboundMessage);

      // 4. Send message via adapter
      const result = await adapter.send(
        connection,
        event.recipientId,
        platformPayload,
      );

      // 5. Update message status
      if (result.success) {
        await this.updateMessageStatus(
          event.messageId,
          MessageStatus.SENT,
          undefined,
          result.platformMessageId,
        );
        this.logger.log(
          `✅ Message sent: ${event.messageId} -> ${result.platformMessageId}`,
        );
      } else {
        await this.updateMessageStatus(
          event.messageId,
          MessageStatus.FAILED,
          result.error,
        );
        this.logger.error(`❌ Failed to send message: ${result.error}`);
      }

      // 6. Publish status notification
      await this.publishStatusNotification(event, result.success ? MessageStatus.SENT : MessageStatus.FAILED);

    } catch (error) {
      this.logger.error(
        `❌ Error processing outgoing message: ${error.message}`,
        error.stack,
      );
      await this.updateMessageStatus(event.messageId, MessageStatus.FAILED, error.message);
    }
  }

  /**
   * Update message status in database
   * Handles race condition: if webhook already created message with real platformMessageId,
   * the pending message should be deleted to avoid duplicates
   */
  private async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    error?: string,
    platformMessageId?: string,
  ): Promise<void> {
    const update: any = { status };

    if (error) {
      update['metadata.error'] = error;
    }

    // If we have a real platformMessageId, handle potential race condition
    if (platformMessageId) {
      try {
        // Check if a message with this platformMessageId already exists (created by webhook)
        const existingMessage = await this.messageModel.findOne({
          platformMessageId,
          _id: { $ne: messageId }, // Not our pending message
        }).exec();

        if (existingMessage) {
          // Webhook already created the real message, delete our pending one
          this.logger.warn(
            `Race condition detected: webhook already created message with ${platformMessageId}, deleting pending message ${messageId}`,
          );
          await this.messageModel.findByIdAndDelete(messageId);
          return;
        }

        // No conflict, safe to update
        update.platformMessageId = platformMessageId;
        await this.messageModel.findByIdAndUpdate(messageId, update);
      } catch (err) {
        // E11000 duplicate key error - webhook beat us to it
        if (err.code === 11000) {
          this.logger.warn(
            `E11000 race condition: deleting pending message ${messageId}`,
          );
          await this.messageModel.findByIdAndDelete(messageId);
          return;
        }
        throw err;
      }
    } else {
      await this.messageModel.findByIdAndUpdate(messageId, update);
    }
  }

  /**
   * Publish status notification via Kafka
   */
  private async publishStatusNotification(
    event: OutgoingMessageEvent,
    status: MessageStatus,
  ): Promise<void> {
    try {
      // Get userId from connection
      const connection = await this.platformConnectionModel
        .findById(event.platformConnectionId)
        .exec();

      if (!connection?.userId) {
        return;
      }

      const userId = connection.userId.toString();

      const notification: WebSocketNotificationEvent = {
        type: 'message:status',
        userId,
        payload: {
          messageId: event.messageId,
          conversationId: event.conversationId,
          status,
        } as MessageStatusPayload,
        timestamp: Date.now(),
      };

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
        key: userId,
        value: notification,
      });
    } catch (error) {
      this.logger.error(`Failed to publish status notification: ${error.message}`);
    }
  }
}
