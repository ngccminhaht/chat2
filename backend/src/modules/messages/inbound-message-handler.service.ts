/**
 * Inbound Message Handler Service
 *
 * Single source of truth for all inbound message processing.
 * Used by: WebhookProcessorService (platforms), VisitorMessageService (web widget)
 *
 * Responsibilities:
 * - Find or create conversation
 * - Save message with deduplication
 * - Update conversation lastMessage
 * - Trigger AI batching
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Platform,
  ConversationStatus,
  MessageStatus,
  MessageDirection,
  MessageType,
} from '@/common/constants';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import { AIBatchingService } from '@/modules/ai-batching/ai-batching.service';

/**
 * Input for processing an inbound message
 */
export interface InboundMessageInput {
  platform: Platform;
  organizationId: string;
  conversationKey: string;
  platformMessageId: string;
  direction: MessageDirection;
  type: MessageType;
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    location?: { latitude: number; longitude: number };
  };
  sender: {
    platformUserId: string;
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  metadata?: Record<string, unknown>;
  // For conversation creation
  customerName?: string;
  customerAvatar?: string;
  platformConnectionId?: string;
  platformAccountId?: string;
}

/**
 * Result of processing an inbound message
 */
export interface InboundMessageResult {
  message: MessageDocument | null; // null if duplicate
  conversation: ConversationDocument;
  isNew: boolean; // true if message was created (not duplicate)
}

@Injectable()
export class InboundMessageHandlerService {
  private readonly logger = new Logger(InboundMessageHandlerService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly aiBatchingService: AIBatchingService,
  ) {}

  /**
   * Process an inbound message from any source (webhook or web widget)
   * Handles: conversation find/create, message save with dedup, lastMessage update, AI batching
   */
  async processInboundMessage(input: InboundMessageInput): Promise<InboundMessageResult> {
    const { platform, organizationId, conversationKey, platformMessageId } = input;

    this.logger.log(`Processing inbound message: ${platform}/${platformMessageId}`);

    // 1. Find or create conversation
    const conversation = await this.findOrCreateConversation(input);

    // 2. Save message with upsert (handles deduplication)
    const { message, isNew } = await this.saveMessageWithUpsert(input, conversation);

    // Skip further processing if duplicate
    if (!isNew) {
      this.logger.log(`⏭️ Skipping duplicate message: ${platformMessageId}`);
      return { message: null, conversation, isNew: false };
    }

    // 3. Update conversation lastMessage
    await this.updateConversationLastMessage(conversation, message, input);

    // 4. Trigger AI batching for inbound messages
    if (input.direction === MessageDirection.INBOUND) {
      await this.triggerAiBatching(message, conversation);
    }

    this.logger.log(`✅ Processed message: ${message._id}`);
    return { message, conversation, isNew: true };
  }

  /**
   * Find existing conversation or create new one
   */
  private async findOrCreateConversation(
    input: InboundMessageInput,
  ): Promise<ConversationDocument> {
    const { platform, organizationId, conversationKey, customerName, customerAvatar, platformConnectionId, platformAccountId, sender } = input;

    let conversation = await this.conversationModel.findOne({
      platform,
      platformConversationId: conversationKey,
    }).exec();

    if (conversation) {
      // Update customer info if it was placeholder
      if (customerName && conversation.customerName.startsWith(`${platform} User`)) {
        conversation.customerName = customerName;
        if (customerAvatar) conversation.customerAvatar = customerAvatar;
        await conversation.save();
      }
      return conversation;
    }

    // Create new conversation
    conversation = await this.conversationModel.create({
      platform,
      platformConversationId: conversationKey,
      platformConnectionId: platformConnectionId ? new Types.ObjectId(platformConnectionId) : new Types.ObjectId(),
      organizationId: new Types.ObjectId(organizationId),
      platformAccountId: platformAccountId || organizationId,
      customerPlatformUserId: sender.platformUserId,
      customerName: customerName || `${platform} User ${sender.platformUserId.substring(0, 8)}`,
      customerAvatar: customerAvatar,
      status: ConversationStatus.OPEN,
      unreadCount: 0,
      metadata: {},
    });

    this.logger.log(`Created new conversation: ${conversation._id}`);
    return conversation;
  }

  /**
   * Save message using atomic upsert pattern
   * Handles deduplication and race conditions in a single operation
   */
  private async saveMessageWithUpsert(
    input: InboundMessageInput,
    conversation: ConversationDocument,
  ): Promise<{ message: MessageDocument; isNew: boolean }> {
    const messageData = {
      conversationId: conversation._id,
      organizationId: conversation.organizationId,
      platform: input.platform,
      platformMessageId: input.platformMessageId,
      direction: input.direction,
      type: input.type,
      content: input.content,
      sender: input.sender,
      status: MessageStatus.SENT,
      metadata: input.metadata || {},
    };

    const result = await this.messageModel.findOneAndUpdate(
      {
        organizationId: conversation.organizationId,
        platform: input.platform,
        platformMessageId: input.platformMessageId,
      },
      { $setOnInsert: messageData },
      { upsert: true, new: true, includeResultMetadata: true },
    ).exec();

    // Check if document already existed (duplicate)
    const isNew = !result.lastErrorObject?.updatedExisting;

    return { message: result.value, isNew };
  }

  /**
   * Update conversation's lastMessage and increment unreadCount
   */
  private async updateConversationLastMessage(
    conversation: ConversationDocument,
    message: MessageDocument,
    input: InboundMessageInput,
  ): Promise<void> {
    const text = input.content.text || `[${input.type}]`;

    await this.conversationModel.findByIdAndUpdate(
      conversation._id,
      {
        lastMessage: {
          text: text.substring(0, 100), // Truncate for preview
          timestamp: input.timestamp,
          senderId: input.sender.platformUserId,
          messageId: message._id,
        },
        $inc: { unreadCount: 1 },
      },
      { timestamps: true },
    );
  }

  /**
   * Trigger AI batching for inbound visitor messages
   */
  private async triggerAiBatching(
    message: MessageDocument,
    conversation: ConversationDocument,
  ): Promise<void> {
    try {
      await this.aiBatchingService.onVisitorMessage(message, conversation);
    } catch (error) {
      // Non-blocking: log error but don't fail message processing
      this.logger.error(`AI batching failed (non-blocking): ${error.message}`);
    }
  }
}
