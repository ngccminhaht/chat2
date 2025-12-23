/**
 * AI Batching Service
 * Manages message batching with BullMQ debounce pattern
 *
 * Flow:
 * 1. Visitor sends message → onVisitorMessage()
 * 2. Create/update batch job with delay
 * 3. Timer expires → processor handles batch
 * 4. Agent replies → cancelBatch() + HUMAN_TAKEOVER
 */

import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
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

    // Check if AI agent is enabled for this organization
    const org = await this.organizationModel.findById(organizationId).lean();
    if (!org?.aiAgentSettings?.enabled) {
      this.logger.debug(
        `Skipping AI batch for ${conversationId}: AI agent disabled for org ${organizationId}`
      );
      return;
    }

    // Skip if human has taken over
    if (conversation.aiState === "HUMAN_TAKEOVER") {
      // Check if takeover has expired
      const takeoverExpired = await this.checkHumanTakeoverExpiry(conversation);
      if (!takeoverExpired) {
        this.logger.debug(
          `Skipping AI batch for ${conversationId}: human takeover active`
        );
        return;
      }
    }

    // Skip if already responding
    if (conversation.aiState === "AI_RESPONDING") {
      this.logger.debug(
        `Skipping AI batch for ${conversationId}: AI currently responding`
      );
      return;
    }

    // Get delay from org config or use default
    const batchDelayMs =
      org.aiAgentSettings?.batchDelayMs || DEFAULT_AI_SETTINGS.batchDelayMs;

    const jobId = `batch_${conversationId}`;
    const existingJob = await this.batchQueue.getJob(jobId);

    if (existingJob) {
      // Extend existing batch with new message
      const data = existingJob.data as BatchJobData;
      data.messageIds.push(message._id.toString());

      // Remove and recreate with updated data (debounce)
      await existingJob.remove();
      await this.createBatchJob(jobId, data, batchDelayMs);

      this.logger.debug(
        `Extended batch ${jobId} with message ${message._id}, total: ${data.messageIds.length}`
      );
    } else {
      // Create new batch
      const data: BatchJobData = {
        conversationId,
        organizationId,
        messageIds: [message._id.toString()],
        createdAt: Date.now(),
      };

      await this.createBatchJob(jobId, data, batchDelayMs);

      // Update conversation state
      await this.updateAIState(conversationId, "BATCHING");

      this.logger.log(`Created new batch ${jobId} for message ${message._id}`);
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
  async updateAIState(
    conversationId: string,
    state: AIState,
    humanTakeoverAt?: Date
  ): Promise<void> {
    const update: any = { aiState: state };
    if (humanTakeoverAt) {
      update.humanTakeoverAt = humanTakeoverAt;
    }

    await this.conversationModel.findByIdAndUpdate(conversationId, update);
  }

  /**
   * Check if human takeover has expired and reset if needed
   * Default: 30 minutes
   */
  private async checkHumanTakeoverExpiry(
    conversation: ConversationDocument
  ): Promise<boolean> {
    if (!conversation.humanTakeoverAt) return false;

    const HUMAN_TAKEOVER_MINUTES = 30;
    const expiryMs = HUMAN_TAKEOVER_MINUTES * 60 * 1000;
    const elapsed = Date.now() - conversation.humanTakeoverAt.getTime();

    if (elapsed >= expiryMs) {
      await this.updateAIState(conversation._id.toString(), "AI_ACTIVE");
      this.logger.log(
        `Human takeover expired for ${conversation._id}, resuming AI`
      );
      return true;
    }

    return false;
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
