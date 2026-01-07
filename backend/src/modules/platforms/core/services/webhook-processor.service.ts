/**
 * Webhook Processor Service
 * Unified webhook processing for all platforms
 * Uses InboundMessageHandlerService for message CRUD + AI batching
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Platform,
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
  ConversationUpdatedPayload,
} from '@/infra/kafka/types/webhook.types';
import { PlatformRegistry } from './platform.registry';
import {
  IPlatformAdapter,
  PlatformEvent,
  MessageEvent,
  DeliveryEvent,
  ReadEvent,
  UserProfile,
} from '../interfaces';
import {
  InboundMessageHandlerService,
} from '@/modules/messages/inbound-message-handler.service';

export interface WebhookProcessResult {
  success: boolean;
  messagesProcessed: number;
  errors: string[];
}

@Injectable()
export class WebhookProcessorService {
  constructor(
    private readonly platformRegistry: PlatformRegistry,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly inboundMessageHandler: InboundMessageHandlerService,
  ) {}

  /**
   * Process webhook payload for any platform
   * Uses adapter pattern to handle platform-specific logic
   */
  async process(platform: Platform, payload: unknown): Promise<WebhookProcessResult> {
    const result: WebhookProcessResult = {
      success: true,
      messagesProcessed: 0,
      errors: [],
    };

    try {
      const adapter = this.platformRegistry.get(platform);

      // 1. Extract account ID from payload
      const accountId = adapter.extractAccountId(payload);

      // 2. Find platform connection
      const connection = await this.findConnection(platform, accountId);
      if (!connection) {
        result.success = false;
        result.errors.push(`Platform connection not found: ${platform}:${accountId}`);
        return result;
      }

      // 3. Extract events from payload
      const events = adapter.extractEvents(payload);

      // 4. Process each event
      for (const event of events) {
        try {
          const processed = await this.processEvent(adapter, event, connection);
          if (processed) {
            result.messagesProcessed++;
          }
        } catch (error) {
          result.errors.push(`Failed to process ${event.type} event: ${error.message}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Webhook processing failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Process a single event
   * @returns true if a message was processed (saved to DB)
   */
  private async processEvent(
    adapter: IPlatformAdapter,
    event: PlatformEvent,
    connection: PlatformConnectionDocument,
  ): Promise<boolean> {
    switch (event.type) {
      case 'message':
        return this.handleMessage(adapter, event as MessageEvent, connection);
      case 'delivery':
        await this.handleDelivery(event as DeliveryEvent);
        return false;
      case 'read':
        await this.handleRead(event as ReadEvent);
        return false;
      case 'postback':
        // Handle postback as message with type 'postback'
        return this.handleMessage(adapter, event as MessageEvent, connection);
      case 'comment':
        // Handle comment as message with type 'comment'
        return this.handleMessage(adapter, event as MessageEvent, connection);
      default:
        return false;
    }
  }

  /**
   * Handle incoming message event
   * Uses InboundMessageHandlerService for CRUD + AI batching
   * @returns true if message was saved, false if skipped
   */
  private async handleMessage(
    adapter: IPlatformAdapter,
    event: MessageEvent,
    connection: PlatformConnectionDocument,
  ): Promise<boolean> {
    const { senderId } = event;

    // Skip echo messages (sent by the page itself)
    if (senderId === connection.platformAccountId) {
      return false;
    }

    // 1. Normalize message using adapter
    const normalized = adapter.normalizeMessage(event);

    // 2. Fetch user profile
    const userProfile = await this.fetchUserProfileSafe(adapter, connection, senderId);

    // 3. Process via shared handler (conversation CRUD + message save + AI batching)
    const result = await this.inboundMessageHandler.processInboundMessage({
      platform: adapter.platform,
      organizationId: connection.organizationId.toString(),
      conversationKey: normalized.conversationKey,
      platformMessageId: normalized.platformMessageId,
      direction: normalized.direction,
      type: normalized.type,
      content: normalized.content,
      sender: {
        platformUserId: normalized.senderId,
        name: userProfile.name,
        avatar: userProfile.avatar,
      },
      timestamp: normalized.timestamp,
      metadata: normalized.metadata,
      customerName: userProfile.name,
      customerAvatar: userProfile.avatar,
      platformConnectionId: connection._id.toString(),
      platformAccountId: connection.platformAccountId,
    });

    // Skip if duplicate
    if (!result.isNew) {
      return false;
    }

    // 4. Publish WebSocket notification (webhook-specific, keep here)
    await this.publishNotification(connection, result.conversation, result.message);

    return true;
  }

  /**
   * Handle delivery status event
   */
  private async handleDelivery(event: DeliveryEvent): Promise<void> {
    const { messageIds } = event;

    if (!messageIds || messageIds.length === 0) {
      return;
    }

    for (const mid of messageIds) {
      await this.messageModel.findOneAndUpdate(
        { platformMessageId: mid },
        { status: MessageStatus.DELIVERED },
      ).exec();
    }
  }

  /**
   * Handle read status event
   */
  private async handleRead(event: ReadEvent): Promise<void> {
    const { watermark } = event;

    if (!watermark) {
      return;
    }

    // Find messages before watermark and mark as read
    await this.messageModel.updateMany(
      {
        direction: MessageDirection.OUTBOUND,
        createdAt: { $lte: new Date(watermark) },
        status: { $ne: MessageStatus.READ },
      },
      { status: MessageStatus.READ },
    ).exec();
  }

  // ==================== Helper Methods ====================

  /**
   * Find platform connection by platform and account ID
   */
  private async findConnection(
    platform: Platform,
    accountId: string,
  ): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel.findOne({
      platform,
      platformAccountId: accountId,
    }).exec();
  }

  /**
   * Fetch user profile with fallback to default
   */
  private async fetchUserProfileSafe(
    adapter: IPlatformAdapter,
    connection: PlatformConnectionDocument,
    userId: string,
  ): Promise<UserProfile> {
    try {
      return await adapter.fetchUserProfile(connection, userId);
    } catch {
      return {
        id: userId,
        name: `${adapter.platform} User ${userId.substring(0, 8)}`,
      };
    }
  }

  /**
   * Publish WebSocket notification via Kafka
   */
  private async publishNotification(
    connection: PlatformConnectionDocument,
    conversation: ConversationDocument,
    message: MessageDocument,
  ): Promise<void> {
    const organizationId = conversation.organizationId.toString();

    // Reload conversation to get updated unreadCount
    const updatedConversation = await this.conversationModel.findById(conversation._id).exec();

    // Publish new message event (broadcast to all org agents)
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

    // Publish conversation updated event
    const conversationEvent: WebSocketNotificationEvent = {
      type: 'conversation:updated',
      organizationId,
      payload: {
        _id: updatedConversation._id.toString(),
        platform: updatedConversation.platform,
        platformConversationId: updatedConversation.platformConversationId,
        customerName: updatedConversation.customerName,
        customerAvatar: updatedConversation.customerAvatar,
        unreadCount: updatedConversation.unreadCount,
        lastMessage: updatedConversation.lastMessage,
      } as ConversationUpdatedPayload,
      timestamp: Date.now(),
    };

    await this.kafkaProducer.publish(KAFKA_TOPICS.WEBSOCKET_NOTIFICATIONS, {
      key: organizationId,
      value: conversationEvent,
    });
  }
}
