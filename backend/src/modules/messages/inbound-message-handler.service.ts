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

import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Platform,
  ConversationStatus,
  MessageStatus,
  MessageDirection,
  MessageType,
} from "@/common/constants";
import {
  Conversation,
  ConversationDocument,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageDocument,
} from "@/common/database/schemas/message.schema";
import {
  Customer,
  CustomerDocument,
} from "@/common/database/schemas/customer.schema";
import { AIBatchingService } from "@/modules/ai-batching/ai-batching.service";

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
    gender?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
  };
  timestamp: Date;
  metadata?: Record<string, unknown>;
  // For conversation creation
  customerName?: string;
  customerAvatar?: string;
  platformConnectionId?: string;
  platformAccountId?: string;
  // User profile metadata (e.g., full Zalo profile data)
  userProfileMetadata?: Record<string, unknown>;
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
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly aiBatchingService: AIBatchingService
  ) {}

  /**
   * Process an inbound message from any source (webhook or web widget)
   * Handles: conversation find/create, message save with dedup, lastMessage update, AI batching
   */
  async processInboundMessage(
    input: InboundMessageInput
  ): Promise<InboundMessageResult> {
    const { platform, organizationId, conversationKey, platformMessageId } =
      input;

    // Extract comment info once at the beginning
    const rawPayload = input.metadata?.rawPayload as any;
    const isComment = input.metadata?.isComment || rawPayload?.isComment;
    const postId =
      input.metadata?.postId ||
      input.metadata?.post_id ||
      rawPayload?.post_id ||
      rawPayload?.postId;

    this.logger.log(
      `Processing inbound message: ${platform}/${platformMessageId}${
        isComment ? ` (COMMENT on post ${postId})` : ""
      }`
    );
    if (isComment) {
      this.logger.log(
        `  💬 Comment details: conversationKey=${conversationKey}, senderId=${input.sender.platformUserId}`
      );
    }

    // 1. Find or create conversation
    const conversation = await this.findOrCreateConversation(input);
    if (isComment) {
      this.logger.log(
        `  ✅ Conversation: ${conversation._id}, key: ${conversation.platformConversationId}`
      );
    }

    // 2. Find or create customer for platform messages
    if (input.platform !== Platform.WEB) {
      this.logger.log(
        `🔍 Checking customer for ${input.platform} user ${input.sender.platformUserId}, conversation.customerId: ${conversation.customerId}`
      );
      if (!conversation.customerId) {
        await this.findOrCreateCustomer(input, conversation);
        // Reload conversation to get updated customerId
        const updatedConversation = await this.conversationModel
          .findById(conversation._id)
          .exec();
        if (updatedConversation?.customerId) {
          conversation.customerId = updatedConversation.customerId;
          this.logger.log(
            `✅ Customer linked: ${updatedConversation.customerId}`
          );
        }
      } else {
        this.logger.log(
          `⏭️ Conversation already has customer: ${conversation.customerId}`
        );
      }
    }

    // 3. Save message with upsert (handles deduplication)
    if (isComment) {
      this.logger.log(
        `  💾 Saving comment message: platformMessageId=${platformMessageId}, conversationId=${conversation._id}`
      );
    }

    const { message, isNew } = await this.saveMessageWithUpsert(
      input,
      conversation
    );

    // Skip further processing if duplicate
    if (!isNew) {
      this.logger.log(
        `⏭️ Skipping duplicate message: ${platformMessageId}${
          isComment ? " (comment)" : ""
        }`
      );
      return { message: null, conversation, isNew: false };
    }

    if (isComment) {
      this.logger.log(
        `  ✅ Comment message saved successfully: messageId=${message._id}, type: ${message.type}, conversationId=${conversation._id}`
      );
    }

    // 4. Update conversation lastMessage
    await this.updateConversationLastMessage(conversation, message, input);

    // 5. Trigger AI batching for inbound messages
    // AI is now allowed for comments - reply loops are prevented by skipping
    // comments from page (AI replies) in the adapter/webhook-processor
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
    input: InboundMessageInput
  ): Promise<ConversationDocument> {
    const {
      platform,
      organizationId,
      conversationKey,
      customerName,
      customerAvatar,
      platformConnectionId,
      platformAccountId,
      sender,
      userProfileMetadata,
    } = input;

    // For Facebook comments, keep them separate from Messenger conversations
    // This ensures AI can respond to comments even if Messenger conversation has aiEnabled=false
    // Comments use post-based key: post_{postId}_{pageId}
    // Messenger uses user-based key: {senderId}_{pageId}
    const finalConversationKey = conversationKey;

    let conversation = await this.conversationModel
      .findOne({
        platform,
        platformConversationId: finalConversationKey,
      })
      .exec();

    if (conversation) {
      // Update customer info if:
      // 1. It was a placeholder (starts with "Platform User")
      // 2. Or we have a new name that's different and not a placeholder
      const isPlaceholder = conversation.customerName.startsWith(
        `${platform} User`
      );
      const hasNewName =
        customerName && customerName !== conversation.customerName;
      const newNameIsNotPlaceholder =
        customerName && !customerName.startsWith(`${platform} User`);

      if (
        customerName &&
        (isPlaceholder || (hasNewName && newNameIsNotPlaceholder))
      ) {
        this.logger.log(
          `🔄 Updating customer name from "${conversation.customerName}" to "${customerName}"`
        );
        conversation.customerName = customerName;
        if (customerAvatar) conversation.customerAvatar = customerAvatar;
        await conversation.save();
      }
      // For comment conversations, update lastCommentId when new comment arrives
      const rawPayload = input.metadata?.rawPayload as any;
      const isComment = input.metadata?.isComment || rawPayload?.isComment;
      if (isComment && platform === Platform.FACEBOOK) {
        const commentId =
          rawPayload?.comment_id ||
          rawPayload?.commentId ||
          input.platformMessageId;
        if (commentId && conversation.metadata?.lastCommentId !== commentId) {
          conversation.metadata = {
            ...conversation.metadata,
            lastCommentId: commentId,
          };
          await conversation.save();
          this.logger.log(
            `  📝 Updated lastCommentId in conversation: ${commentId}`
          );
        }
      }

      // Update metadata with user profile data if available (e.g., Zalo profile)
      if (userProfileMetadata && Object.keys(userProfileMetadata).length > 0) {
        conversation.metadata = {
          ...conversation.metadata,
          ...userProfileMetadata,
        };
        await conversation.save();
      }
      return conversation;
    }

    // Check if this is a comment on a post (for Facebook)
    const rawPayload = input.metadata?.rawPayload as any;
    const isComment = input.metadata?.isComment || rawPayload?.isComment;
    const postId =
      input.metadata?.postId ||
      input.metadata?.post_id ||
      rawPayload?.post_id ||
      rawPayload?.postId;

    // Build metadata for conversation
    const conversationMetadata: any = { ...(userProfileMetadata || {}) };

    // For Facebook post comments, add specific metadata
    if (isComment && postId && platform === Platform.FACEBOOK) {
      const rawPayload = input.metadata?.rawPayload as any;
      const commentId =
        rawPayload?.comment_id ||
        rawPayload?.commentId ||
        input.platformMessageId;
      const postContent = input.metadata?.postContent as
        | { message?: string; story?: string }
        | undefined;

      conversationMetadata.type = "post_comments";
      conversationMetadata.postId = postId;
      conversationMetadata.pageId = platformAccountId;
      conversationMetadata.lastCommentId = commentId; // Store for easy retrieval when replying
      if (postContent) {
        conversationMetadata.postContent = postContent; // Store post content for AI context
      }
      this.logger.log(
        `📝 Creating conversation for post comment: postId=${postId}, pageId=${platformAccountId}, commentId=${commentId}${
          postContent
            ? `, postContent: ${
                postContent.message || postContent.story || "no content"
              }`
            : ""
        }`
      );
    }

    // Create new conversation with user profile metadata
    // Use finalConversationKey (may be different from original conversationKey for comments)
    conversation = await this.conversationModel.create({
      platform,
      platformConversationId: finalConversationKey,
      platformConnectionId: platformConnectionId
        ? new Types.ObjectId(platformConnectionId)
        : new Types.ObjectId(),
      organizationId: new Types.ObjectId(organizationId),
      platformAccountId: platformAccountId || organizationId,
      customerPlatformUserId: sender.platformUserId,
      customerName:
        customerName ||
        `${platform} User ${sender.platformUserId.substring(0, 8)}`,
      customerAvatar: customerAvatar,
      status: ConversationStatus.OPEN,
      unreadCount: 0,
      metadata: conversationMetadata,
    });

    this.logger.log(
      `✅ Created new conversation: ${conversation._id} (comment: ${
        isComment ? "yes" : "no"
      })`
    );
    return conversation;
  }

  /**
   * Save message using atomic upsert pattern
   * Handles deduplication and race conditions in a single operation
   */
  private async saveMessageWithUpsert(
    input: InboundMessageInput,
    conversation: ConversationDocument
  ): Promise<{ message: MessageDocument; isNew: boolean }> {
    const rawPayload = input.metadata?.rawPayload as any;
    const isComment = input.metadata?.isComment || rawPayload?.isComment;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/423e5f34-2a1b-49c7-ad3a-11122d9bd1d9", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "inbound-message-handler.service.ts:376",
        message: "[H1,H4] Saving message - checking isComment flag",
        data: {
          platformMessageId: input.platformMessageId,
          hasMetadata: !!input.metadata,
          metadataIsComment: input.metadata?.isComment,
          rawPayloadIsComment: rawPayload?.isComment,
          isComment,
          conversationType: conversation.metadata?.type,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "H1,H4",
      }),
    }).catch(() => {});
    // #endregion

    // Ensure isComment flag is explicitly set in metadata (not undefined)
    // Check both input.metadata.isComment and rawPayload.isComment for compatibility
    const metadata = {
      ...(input.metadata || {}),
      isComment: isComment ?? false, // Use pre-extracted isComment (checks both metadata and rawPayload)
    };

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
      metadata,
    };

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/423e5f34-2a1b-49c7-ad3a-11122d9bd1d9", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "inbound-message-handler.service.ts:390",
        message: "[H1] Message data before save - metadata content",
        data: {
          platformMessageId: input.platformMessageId,
          metadataKeys: Object.keys(messageData.metadata),
          metadataIsComment: messageData.metadata.isComment,
          metadataRawPayloadIsComment: (messageData.metadata as any)?.rawPayload
            ?.isComment,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion

    const result = await this.messageModel
      .findOneAndUpdate(
        {
          organizationId: conversation.organizationId,
          platform: input.platform,
          platformMessageId: input.platformMessageId,
        },
        { $setOnInsert: messageData },
        { upsert: true, new: true, includeResultMetadata: true }
      )
      .exec();

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
    input: InboundMessageInput
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
      { timestamps: true }
    );
  }

  /**
   * Find or create customer for platform messages
   */
  private async findOrCreateCustomer(
    input: InboundMessageInput,
    conversation: ConversationDocument
  ): Promise<void> {
    try {
      const { platform, organizationId, sender } = input;
      const { platformUserId, name, avatar } = sender;

      this.logger.log(
        `🔍 Finding customer for ${platform} user ${platformUserId} in org ${organizationId}`
      );

      // Find existing customer by platform identity
      let customer = await this.customerModel.findOne({
        organizationId: new Types.ObjectId(organizationId),
        "platformIdentities.platform": platform,
        "platformIdentities.platformUserId": platformUserId,
      });

      const now = new Date();

      if (customer) {
        this.logger.log(`✅ Found existing customer: ${customer._id}`);
        // Update last seen and link to conversation if not already linked
        await this.customerModel.findByIdAndUpdate(customer._id, {
          lastSeenAt: now,
          lastContactedAt: now,
          $inc: { totalMessages: 1 },
        });

        // Link customer to conversation
        await this.conversationModel.findByIdAndUpdate(conversation._id, {
          customerId: customer._id,
        });
        this.logger.log(
          `✅ Linked existing customer ${customer._id} to conversation ${conversation._id}`
        );
      } else {
        this.logger.log(
          `📝 Creating new customer for ${platform}:${platformUserId}`
        );
        // Create new customer
        customer = await this.customerModel.create({
          organizationId: new Types.ObjectId(organizationId),
          name: name || `${platform} User ${platformUserId.substring(0, 8)}`,
          avatar,
          platformIdentities: [
            {
              platform,
              platformUserId,
              displayName: name,
              avatar,
            },
          ],
          firstSeenAt: now,
          lastSeenAt: now,
          lastContactedAt: now,
          totalConversations: 1,
          totalMessages: 1,
        });

        this.logger.log(`✅ Created new customer: ${customer._id}`);

        // Link customer to conversation
        await this.conversationModel.findByIdAndUpdate(conversation._id, {
          customerId: customer._id,
        });

        this.logger.log(
          `✅ Linked new customer ${customer._id} to conversation ${conversation._id}`
        );
      }
    } catch (error) {
      // Non-blocking: log error but don't fail message processing
      this.logger.error(
        `❌ Failed to create/link customer (non-blocking):`,
        error.message,
        error.stack
      );
    }
  }

  /**
   * Trigger AI batching for inbound visitor messages
   */
  private async triggerAiBatching(
    message: MessageDocument,
    conversation: ConversationDocument
  ): Promise<void> {
    try {
      this.logger.log(
        `🤖 [AI Trigger] Attempting to trigger AI batching | ` +
          `Message: ${message._id} | Conversation: ${conversation._id} | ` +
          `Direction: ${message.direction} | Type: ${message.type} | ` +
          `AI Enabled: ${conversation.aiEnabled} | AI State: ${conversation.aiState}`
      );
      await this.aiBatchingService.onVisitorMessage(message, conversation);
      this.logger.log(
        `✅ [AI Trigger] Successfully triggered AI batching for message ${message._id}`
      );
    } catch (error) {
      // Non-blocking: log error but don't fail message processing
      this.logger.error(
        `❌ [AI Trigger] AI batching failed (non-blocking): ${error.message}`,
        error.stack
      );
    }
  }
}
