/**
 * AI Batching Service
 * Manages message batching with BullMQ debounce pattern
 *
 * Flow:
 * 1. Visitor sends message → onVisitorMessage()
 * 2. Check connection.aiSettings.enabled + conversation.aiEnabled
 * 3. Create/update batch job with delay (debounce)
 * 4. Timer expires → processor handles batch
 * 5. Agent replies → cancelBatch() + set aiEnabled=false
 */

import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Platform } from "@/common/constants";
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
import {
  Customer,
  CustomerDocument,
} from "@/common/database/schemas/customer.schema";
import {
  BatchJobData,
  DEFAULT_AI_SETTINGS,
  AIState,
} from "./dto/batch-job.dto";
import { MessageType } from "@/common/constants";

export const AI_BATCH_QUEUE = "ai-batch";

@Injectable()
export class AIBatchingService {
  private readonly logger = new Logger(AIBatchingService.name);

  constructor(
    @InjectQueue(AI_BATCH_QUEUE) private readonly batchQueue: Queue,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>
  ) {}

  /**
   * Called when a visitor message is saved
   * Creates or extends a batch job with debounce
   */
  async onVisitorMessage(
    message: MessageDocument,
    conversation: ConversationDocument
  ): Promise<void> {
    const conversationId = conversation._id.toString();
    const organizationId = conversation.organizationId.toString();

    this.logger.log(
      `🔍 [AI Batch] onVisitorMessage called | ` +
        `Message: ${message._id} | Conversation: ${conversationId} | ` +
        `Org: ${organizationId} | Type: ${message.type} | ` +
        `AI Enabled: ${conversation.aiEnabled} | AI State: ${conversation.aiState}`
    );

    // AI is now allowed for comment conversations
    // Reply loops are prevented by skipping comments from page (AI replies)
    // in facebook.adapter.ts and webhook-processor.service.ts
    // Comments from page with parent_id are skipped, so AI won't reply to its own comments

    // Check if AI is enabled for this conversation
    if (conversation.aiEnabled === false) {
      this.logger.log(
        `⏭️ [AI Batch] Skipping: AI disabled for conversation ${conversationId} | ` +
          `Reason: Agent has replied previously, AI is manually disabled. ` +
          `To re-enable AI, agent needs to toggle it back on in the conversation settings.`
      );
      return;
    }

    // Check if AI agent is enabled for this connection (page/OA)
    const connection = await this.platformConnectionModel.findOne({
      platform: conversation.platform,
      platformAccountId: conversation.platformAccountId,
    }).lean();

    this.logger.log(
      `🔍 [AI Batch] Connection check | ` +
        `Connection found: ${!!connection} | AI enabled: ${
          connection?.aiSettings?.enabled
        } | ` +
        `API key: ${!!connection?.aiSettings?.apiKey}`
    );

    if (!connection?.aiSettings?.enabled) {
      this.logger.log(
        `⏭️ [AI Batch] Skipping: AI agent disabled for connection ${conversation.platformAccountId}`
      );
      return;
    }

    // Get delay from connection config or use default
    const baseBatchDelayMs =
      connection.aiSettings?.batchDelayMs || DEFAULT_AI_SETTINGS.batchDelayMs;

    const jobId = `batch_${conversationId}`;
    const existingJob = await this.batchQueue.getJob(jobId);

    // If message is image and no existing batch, skip (wait for text)
    // When text arrives, it will include all unsent images
    if (!existingJob && message.type === MessageType.IMAGE) {
      this.logger.log(
        `⏭️ [AI Batch] Skipping image-only message ${message._id} - waiting for text message`
      );
      return;
    }

    if (existingJob) {
      // Extend existing batch with new message
      const data = existingJob.data as BatchJobData;
      data.messageIds.push(message._id.toString());

      // Remove and recreate with updated data (debounce)
      await existingJob.remove();
      await this.createBatchJob(jobId, data, baseBatchDelayMs);

      this.logger.debug(
        `Extended batch ${jobId} with message ${message._id} (type: ${message.type}), ` +
          `total: ${data.messageIds.length}, delay: ${baseBatchDelayMs}ms`
      );
    } else {
      // Create new batch
      // Include ALL unsent messages (not just images) when creating a new batch
      // This ensures messages sent while AI was disabled are included
      const unsentMessages = await this.getUnsentMessages(conversationId);

      // Filter out current message if already in unsent list (avoid duplicates)
      const currentMessageId = message._id.toString();
      let messageIds = unsentMessages
        .filter((m) => m._id.toString() !== currentMessageId)
        .map((m) => m._id.toString());

      // Add current message at the end (most recent)
      messageIds.push(currentMessageId);

      if (unsentMessages.length > 1) {
        this.logger.log(
          `📦 [AI Batch] Including ${unsentMessages.length - 1} previously unsent message(s) with new message`
        );
      }

      const data: BatchJobData = {
        conversationId,
        organizationId,
        messageIds,
        createdAt: Date.now(),
      };

      await this.createBatchJob(jobId, data, baseBatchDelayMs);

      // Update conversation state
      await this.updateAIState(conversationId, "BATCHING");

      this.logger.log(
        `Created new batch ${jobId} for message ${message._id} (type: ${message.type}), ` +
          `total messages: ${messageIds.length}, delay: ${baseBatchDelayMs}ms`
      );
    }
  }

  /**
   * Cancel pending batch when agent takes over
   */
  async cancelBatch(conversationId: string): Promise<boolean> {
    const jobId = `batch_${conversationId}`;
    const job = await this.batchQueue.getJob(jobId);

    if (job) {
      await job.remove();
      this.logger.log(`Cancelled batch ${jobId} due to agent takeover`);
      return true;
    }

    return false;
  }

  /**
   * Get pending messages for a batch
   * IMPORTANT: Query DB directly for unsent messages (both directions)
   *
   * Gets:
   * - INBOUND: Customer messages (sentToAiAt=null)
   * - OUTBOUND: Human advisor messages (sentToAiAt=null, excludes AI's own)
   */
  async getPendingMessages(
    conversationId: string
  ): Promise<MessageDocument[]> {
    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        sentToAiAt: null, // Only unsent messages (both directions)
        'sender.platformUserId': { $ne: 'ai-agent' } // Exclude AI's own messages
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get conversation by ID
   */
  async getConversation(
    conversationId: string
  ): Promise<ConversationDocument | null> {
    return this.conversationModel.findById(conversationId).exec();
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<CustomerDocument | null> {
    return this.customerModel.findById(customerId).exec();
  }

  /**
   * Update conversation AI state
   */
  async updateAIState(conversationId: string, state: AIState): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      aiState: state,
    });
  }

  /**
   * Get all unsent inbound messages in conversation
   * Messages are marked as sent when included in a batch that's sent to AI
   * Once a message is sent to AI, it won't be sent again.
   */
  private async getUnsentMessages(
    conversationId: string
  ): Promise<MessageDocument[]> {
    // Only get messages that haven't been sent to AI yet
    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        direction: "inbound",
        sentToAiAt: null,
      })
      .sort({ createdAt: 1 }) // Oldest first
      .exec();
  }

  /**
   * Get all unsent image messages in conversation
   * @deprecated Use getUnsentMessages instead
   */
  private async getUnsentImages(
    conversationId: string
  ): Promise<MessageDocument[]> {
    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        type: MessageType.IMAGE,
        direction: "inbound",
        sentToAiAt: null, // Use dedicated field instead of metadata
      })
      .sort({ createdAt: 1 }) // Oldest first
      .limit(10) // Max 10 images per batch
      .exec();
  }

  /**
   * Mark messages as sent to AI (all types)
   */
  async markMessagesAsSent(messageIds: Types.ObjectId[]): Promise<void> {
    if (messageIds.length === 0) return;

    const result = await this.messageModel.updateMany(
      {
        _id: { $in: messageIds },
      },
      {
        $set: { sentToAiAt: new Date() },
      }
    );

    this.logger.log(
      `✅ [AI Batch] Marked ${result.modifiedCount}/${messageIds.length} message(s) as sent to AI | ` +
      `IDs: ${messageIds.map(id => id.toString()).join(', ')}`
    );
  }

  /**
   * Mark image messages as sent to AI
   * @deprecated Use markMessagesAsSent instead
   */
  async markImagesAsSent(messageIds: Types.ObjectId[]): Promise<void> {
    if (messageIds.length === 0) return;

    await this.messageModel.updateMany(
      {
        _id: { $in: messageIds },
        type: MessageType.IMAGE,
      },
      {
        $set: { sentToAiAt: new Date() },
      }
    );

    this.logger.debug(
      `Marked ${messageIds.length} image message(s) as sent to AI`
    );
  }

  /**
   * Create a delayed batch job
   */
  private async createBatchJob(
    jobId: string,
    data: BatchJobData,
    delayMs: number
  ): Promise<void> {
    await this.batchQueue.add("process-batch", data, {
      jobId,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
