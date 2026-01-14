/**
 * Webhook Processor Service
 * Unified webhook processing for all platforms
 * Uses InboundMessageHandlerService for message CRUD + AI batching
 */

import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Platform, MessageStatus, MessageDirection } from "@/common/constants";
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageDocument,
} from "@/common/database/schemas/message.schema";
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from "@/common/database/schemas/platform-connection.schema";
import { KafkaProducerService } from "@/infra/kafka/kafka-producer.service";
import { KAFKA_TOPICS } from "@/infra/kafka/kafka.config";
import {
  WebSocketNotificationEvent,
  NewMessagePayload,
  ConversationUpdatedPayload,
} from "@/infra/kafka/types/webhook.types";
import { PlatformRegistry } from "./platform.registry";
import {
  IPlatformAdapter,
  PlatformEvent,
  MessageEvent,
  DeliveryEvent,
  ReadEvent,
  UserProfile,
} from "../interfaces";
import { InboundMessageHandlerService } from "@/modules/messages/inbound-message-handler.service";

export interface WebhookProcessResult {
  success: boolean;
  messagesProcessed: number;
  errors: string[];
}

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private readonly platformRegistry: PlatformRegistry,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly inboundMessageHandler: InboundMessageHandlerService
  ) {}

  /**
   * Process webhook payload for any platform
   * Uses adapter pattern to handle platform-specific logic
   */
  async process(
    platform: Platform,
    payload: unknown
  ): Promise<WebhookProcessResult> {
    const result: WebhookProcessResult = {
      success: true,
      messagesProcessed: 0,
      errors: [],
    };

    try {
      const adapter = this.platformRegistry.get(platform);

      // 1. Extract account ID from payload
      const accountId = adapter.extractAccountId(payload);
      this.logger.log(
        `🔍 Processing ${platform} webhook for account: ${accountId}`
      );

      // 2. Find platform connection
      const connection = await this.findConnection(platform, accountId);
      if (!connection) {
        result.success = false;
        const errorMsg = `Platform connection not found: ${platform}:${accountId}`;
        result.errors.push(errorMsg);
        this.logger.error(`❌ ${errorMsg}`);
        return result;
      }

      this.logger.log(`✅ Found platform connection: ${connection._id}`);

      // 3. Extract events from payload
      const events = adapter.extractEvents(payload);
      this.logger.log(`📦 Extracted ${events.length} events from payload`);

      // Log comment events specifically
      const commentEvents = events.filter((e) => {
        const rawPayload = (e as any).rawPayload;
        return (
          rawPayload?.isComment || rawPayload?.post_id || rawPayload?.postId
        );
      });
      if (commentEvents.length > 0) {
        this.logger.log(`💬 Found ${commentEvents.length} comment event(s)`);
        commentEvents.forEach((event, idx) => {
          const rawPayload = (event as any).rawPayload;
          this.logger.log(
            `  [${idx}] Comment: postId=${
              rawPayload?.post_id || rawPayload?.postId
            }, senderId=${event.senderId}`
          );
        });
      }

      // 4. Process each event
      for (const event of events) {
        try {
          const isComment = (event as any).rawPayload?.isComment;
          if (isComment) {
            this.logger.log(
              `🔄 Processing comment event: senderId=${
                event.senderId
              }, postId=${
                (event as any).rawPayload?.post_id ||
                (event as any).rawPayload?.postId
              }`
            );
          }

          const processed = await this.processEvent(adapter, event, connection);
          if (processed) {
            result.messagesProcessed++;
            if (isComment) {
              this.logger.log(`✅ Comment event processed successfully`);
            }
          } else {
            if (isComment) {
              this.logger.log(
                `⏭️  Comment event skipped (duplicate or filtered)`
              );
            }
          }
        } catch (error) {
          const errorMsg = `Failed to process ${event.type} event: ${error.message}`;
          result.errors.push(errorMsg);
          this.logger.error(`❌ ${errorMsg}`, error.stack);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }
    } catch (error) {
      result.success = false;
      const errorMsg = `Webhook processing failed: ${error.message}`;
      result.errors.push(errorMsg);
      this.logger.error(`❌ ${errorMsg}`, error.stack);
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
    connection: PlatformConnectionDocument
  ): Promise<boolean> {
    switch (event.type) {
      case "message":
        return this.handleMessage(adapter, event as MessageEvent, connection);
      case "delivery":
        await this.handleDelivery(event as DeliveryEvent);
        return false;
      case "read":
        await this.handleRead(event as ReadEvent);
        return false;
      case "postback":
        // Handle postback as message with type 'postback'
        return this.handleMessage(adapter, event as MessageEvent, connection);
      case "comment":
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
    connection: PlatformConnectionDocument
  ): Promise<boolean> {
    const { senderId } = event;
    const isComment = (event.rawPayload as any)?.isComment;

    // Skip echo messages (sent by the page itself)
    // For regular messages: skip if senderId === pageId
    // For comments: also skip if senderId === pageId (page's own comments/replies should not be saved)
    // This prevents saving comments created by AI/agent replies, which would cause loops
    if (senderId === connection.platformAccountId) {
      if (isComment) {
        this.logger.log(`⏭️ Skipping comment from page itself: senderId=${senderId} (pageId=${connection.platformAccountId}) - this is likely a reply from AI/agent`);
      } else {
        this.logger.log(`⏭️ Skipping echo message from page: ${senderId}`);
      }
      return false;
    }

    if (isComment) {
      this.logger.log(`💬 Processing comment from customer: senderId=${senderId}, pageId=${connection.platformAccountId}`);
    }

    // 1. Normalize message using adapter
    const normalized = adapter.normalizeMessage(event);
    
    if (isComment) {
      this.logger.log(`  📝 Normalized: conversationKey=${normalized.conversationKey}, platformMessageId=${normalized.platformMessageId}`);
    }

    // 2. Fetch user profile
    // For comments, use name from rawPayload if available (from.name or sender_name)
    let userProfile: UserProfile;
    if (isComment) {
      const rawPayload = event.rawPayload as any;
      const commenterName = rawPayload?.sender_name || rawPayload?.from?.name;
      if (commenterName) {
        this.logger.log(`  👤 Using commenter name from webhook: ${commenterName}`);
        userProfile = {
          id: senderId,
          name: commenterName,
        };
      } else {
        this.logger.log(`  👤 Fetching user profile for commenter: ${senderId}`);
        userProfile = await this.fetchUserProfileSafe(
          adapter,
          connection,
          senderId
        );
      }
    } else {
      userProfile = await this.fetchUserProfileSafe(
        adapter,
        connection,
        senderId
      );
    }

    // 3. Process via shared handler (conversation CRUD + message save + AI batching)
    // Merge userProfile metadata (e.g., Zalo profile data) into message metadata
    const mergedMetadata = {
      ...normalized.metadata,
      ...(userProfile.metadata || {}), // Include Zalo profile data if available
    };

    if (isComment) {
      this.logger.log(`  📤 Calling processInboundMessage for comment...`);
    }

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
        gender: userProfile.gender,
        phone: userProfile.phone,
        email: userProfile.email,
        birthDate: userProfile.birthDate,
      },
      timestamp: normalized.timestamp,
      metadata: mergedMetadata,
      customerName: userProfile.name,
      customerAvatar: userProfile.avatar,
      platformConnectionId: connection._id.toString(),
      platformAccountId: connection.platformAccountId,
      // Pass userProfile metadata for saving to conversation/customer
      userProfileMetadata: userProfile.metadata,
    });

    // Skip if duplicate
    if (!result.isNew) {
      if (isComment) {
        this.logger.log(`  ⏭️ Comment message is duplicate, skipping`);
      }
      return false;
    }

    if (isComment) {
      this.logger.log(`  ✅ Comment message processed successfully: messageId=${result.message?._id}, conversationId=${result.conversation._id}`);
    }

    // 4. Publish WebSocket notification (webhook-specific, keep here)
    await this.publishNotification(
      connection,
      result.conversation,
      result.message
    );

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
      await this.messageModel
        .findOneAndUpdate(
          { platformMessageId: mid },
          { status: MessageStatus.DELIVERED }
        )
        .exec();
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
    await this.messageModel
      .updateMany(
        {
          direction: MessageDirection.OUTBOUND,
          createdAt: { $lte: new Date(watermark) },
          status: { $ne: MessageStatus.READ },
        },
        { status: MessageStatus.READ }
      )
      .exec();
  }

  // ==================== Helper Methods ====================

  /**
   * Find platform connection by platform and account ID
   */
  private async findConnection(
    platform: Platform,
    accountId: string
  ): Promise<PlatformConnectionDocument | null> {
    return this.platformConnectionModel
      .findOne({
        platform,
        platformAccountId: accountId,
      })
      .exec();
  }

  /**
   * Fetch user profile with fallback to default
   */
  private async fetchUserProfileSafe(
    adapter: IPlatformAdapter,
    connection: PlatformConnectionDocument,
    userId: string
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
    message: MessageDocument
  ): Promise<void> {
    const organizationId = conversation.organizationId.toString();

    // Reload conversation to get updated unreadCount
    const updatedConversation = await this.conversationModel
      .findById(conversation._id)
      .exec();

    // Publish new message event (broadcast to all org agents)
    const messageEvent: WebSocketNotificationEvent = {
      type: "message:new",
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
      type: "conversation:updated",
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
