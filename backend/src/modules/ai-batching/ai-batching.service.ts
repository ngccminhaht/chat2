/**
 * AI Batching Service
 * Manages message batching with BullMQ debounce pattern
 *
 * Flow:
 * 1. Visitor sends message → onVisitorMessage()
 * 2. Check org.aiAgentSettings.enabled + conversation.aiEnabled
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
  Organization,
  OrganizationDocument,
} from "@/common/database/schemas/organization.schema";
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
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
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

    // Check if AI agent is enabled for this organization
    const org = await this.organizationModel.findById(organizationId).lean();
    this.logger.log(
      `🔍 [AI Batch] Organization check | ` +
        `Org found: ${!!org} | AI enabled: ${
          org?.aiAgentSettings?.enabled
        } | ` +
        `API key: ${!!org?.aiAgentSettings?.apiKey}`
    );
    if (!org?.aiAgentSettings?.enabled) {
      this.logger.log(
        `⏭️ [AI Batch] Skipping: AI agent disabled for org ${organizationId}`
      );
      return;
    }

    // Skip if already responding
    if (conversation.aiState === "AI_RESPONDING") {
      this.logger.log(
        `⏭️ [AI Batch] Skipping: Already responding for conversation ${conversationId}`
      );
      return;
    }

    // Get delay from org config or use default
    const baseBatchDelayMs =
      org.aiAgentSettings?.batchDelayMs || DEFAULT_AI_SETTINGS.batchDelayMs;

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
      // If message is text, include all unsent images in conversation
      let messageIds = [message._id.toString()];

      if (message.type === MessageType.TEXT) {
        const unsentImages = await this.getUnsentImages(conversationId);
        if (unsentImages.length > 0) {
          messageIds = [
            ...unsentImages.map((img) => img._id.toString()),
            ...messageIds,
          ];
          this.logger.log(
            `📷 [AI Batch] Including ${unsentImages.length} unsent image(s) with text message`
          );
        }
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
   * Ensures messages belong to the specified conversation
   */
  async getPendingMessages(
    conversationId: string,
    messageIds: string[]
  ): Promise<MessageDocument[]> {
    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        _id: { $in: messageIds.map((id) => new Types.ObjectId(id)) },
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
   * Get all unsent image messages in conversation
   * Images are marked as sent when included in a batch that's sent to AI
   */
  private async getUnsentImages(
    conversationId: string
  ): Promise<MessageDocument[]> {
    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        type: MessageType.IMAGE,
        direction: "inbound",
        $or: [
          { "metadata.sentToAI": { $ne: true } },
          { "metadata.sentToAI": { $exists: false } },
        ],
      })
      .sort({ createdAt: 1 }) // Oldest first
      .limit(10) // Max 10 images per batch
      .exec();
  }

  /**
   * Mark image messages as sent to AI
   */
  async markImagesAsSent(messageIds: Types.ObjectId[]): Promise<void> {
    if (messageIds.length === 0) return;

    await this.messageModel.updateMany(
      {
        _id: { $in: messageIds },
        type: MessageType.IMAGE,
      },
      {
        $set: { "metadata.sentToAI": true },
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
