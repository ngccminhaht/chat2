/**
 * Message Sender Service
 * Unified outbound message handling for all platforms
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Platform,
  MessageType,
  MessageStatus,
  MessageDirection,
} from '@/common/constants';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  MessageStatusPayload,
} from '@/infra/kafka/types/webhook.types';
import { PlatformRegistry } from './platform.registry';
import { OutboundMessage, SendResult } from '../interfaces';

export interface SendMessageDto {
  conversationId: string;
  type: MessageType;
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
  };
}

export interface SendMessageResult {
  success: boolean;
  message?: MessageDocument;
  error?: string;
}

@Injectable()
export class MessageSenderService {
  private readonly logger = new Logger(MessageSenderService.name);

  constructor(
    private readonly platformRegistry: PlatformRegistry,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Send message to customer via platform
   */
  async send(dto: SendMessageDto): Promise<SendMessageResult> {
    const { conversationId, type, content } = dto;

    try {
      // 1. Get conversation
      const conversation = await this.conversationModel.findById(conversationId).exec();
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }

      // 2. Get platform connection
      const connection = await this.platformConnectionModel
        .findById(conversation.platformConnectionId)
        .exec();
      if (!connection) {
        return { success: false, error: 'Platform connection not found' };
      }

      // 3. Get platform adapter
      const adapter = this.platformRegistry.get(conversation.platform as Platform);

      // 4. Create pending message in database
      const message = await this.messageModel.create({
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        platform: conversation.platform,
        platformMessageId: `pending_${Date.now()}`,
        direction: MessageDirection.OUTBOUND,
        type,
        content,
        sender: {
          platformUserId: connection.platformAccountId,
          name: connection.platformAccountName,
        },
        status: MessageStatus.PENDING,
        metadata: {},
      });

      this.logger.log(`Created pending message: ${message._id}`);

      // 5. Format message for platform
      const outboundMessage: OutboundMessage = { type, content };
      const platformPayload = adapter.formatOutbound(outboundMessage);

      // 6. Send to platform
      const sendResult = await adapter.send(
        connection,
        conversation.customerPlatformUserId,
        platformPayload,
      );

      // 7. Update message status based on result
      if (sendResult.success && sendResult.platformMessageId) {
        message.platformMessageId = sendResult.platformMessageId;
        message.status = MessageStatus.SENT;
        this.logger.log(`Message sent successfully: ${sendResult.platformMessageId}`);
      } else {
        message.status = MessageStatus.FAILED;
        message.metadata = { error: sendResult.error };
        this.logger.error(`Failed to send message: ${sendResult.error}`);
      }

      await message.save();

      // 8. Update conversation last message
      await this.updateConversationLastMessage(conversation, message, content);

      // 9. Publish notifications
      await this.publishNotifications(connection, conversation, message);

      return {
        success: sendResult.success,
        message,
        error: sendResult.error,
      };

    } catch (error) {
      this.logger.error(`Send message failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update message status (called by delivery/read webhooks)
   */
  async updateStatus(
    platformMessageId: string,
    status: MessageStatus,
  ): Promise<boolean> {
    const message = await this.messageModel.findOneAndUpdate(
      { platformMessageId },
      { status },
      { new: true },
    ).exec();

    if (!message) {
      this.logger.warn(`Message not found for status update: ${platformMessageId}`);
      return false;
    }

    // Publish status update
    const conversation = await this.conversationModel.findById(message.conversationId).exec();
    if (conversation) {
      const connection = await this.platformConnectionModel
        .findById(conversation.platformConnectionId)
        .exec();

      if (connection?.connectedBy) {
        await this.publishStatusUpdate(connection.connectedBy.toString(), message);
      }
    }

    return true;
  }

  // ==================== Helper Methods ====================

  /**
   * Update conversation's last message
   */
  private async updateConversationLastMessage(
    conversation: ConversationDocument,
    message: MessageDocument,
    content: { text?: string },
  ): Promise<void> {
    const text = content.text || `[${message.type}]`;

    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      lastMessage: {
        text: text.substring(0, 100),
        timestamp: new Date(),
        senderId: message.sender.platformUserId,
        messageId: message._id,
      },
    });
  }

  /**
   * Publish WebSocket notifications (broadcast to all org agents)
   */
  private async publishNotifications(
    connection: PlatformConnectionDocument,
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    const organizationId = conversation.organizationId.toString();

    // Publish new message event (broadcast to org)
    const messageEvent: WebSocketNotificationEvent = {
      type: 'message:new',
      organizationId,
      payload: {
        _id: message._id.toString(),
        conversationId: message.conversationId.toString(),
        platform: message.platform,
        direction: message.direction,
        type: message.type,
        content: message.content,
        sender: message.sender,
        status: message.status,
        createdAt: (message as any).createdAt,
      } as NewMessagePayload,
      timestamp: Date.now(),
    };

    await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
      key: organizationId,
      value: messageEvent,
    });
  }

  /**
   * Publish message status update
   */
  private async publishStatusUpdate(
    userId: string,
    message: MessageDocument,
  ): Promise<void> {
    const statusEvent: WebSocketNotificationEvent = {
      type: 'message:status',
      userId,
      payload: {
        messageId: message._id.toString(),
        conversationId: message.conversationId.toString(),
        status: message.status,
      } as MessageStatusPayload,
      timestamp: Date.now(),
    };

    await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
      key: userId,
      value: statusEvent,
    });
  }
}
