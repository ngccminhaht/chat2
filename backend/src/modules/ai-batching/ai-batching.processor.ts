/**
 * AI Batching Processor
 * Handles batch jobs when debounce timer expires
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AIBatchingService, AI_BATCH_QUEUE } from './ai-batching.service';
import { BatchJobData, DEFAULT_AI_SETTINGS } from './dto/batch-job.dto';

@Processor(AI_BATCH_QUEUE)
export class AIBatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(AIBatchingProcessor.name);

  constructor(private readonly batchingService: AIBatchingService) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const { conversationId, organizationId, messageIds } = job.data;

    this.logger.log(
      `Processing batch for conversation ${conversationId} with ${messageIds.length} message(s)`,
    );

    try {
      // Update state to AI_RESPONDING
      await this.batchingService.updateAIState(conversationId, 'AI_RESPONDING');

      // Get pending messages
      const messages = await this.batchingService.getPendingMessages(messageIds);

      if (messages.length === 0) {
        this.logger.warn(`No messages found for batch ${job.id}`);
        await this.batchingService.updateAIState(conversationId, 'AI_ACTIVE');
        return;
      }

      // Combine message texts for AI context
      const batchedContent = messages
        .map((m) => m.content?.text || '')
        .filter(Boolean)
        .join('\n');

      this.logger.debug(`Batched content for AI: ${batchedContent.substring(0, 100)}...`);

      // TODO: Call AI service here
      // const aiResponse = await this.aiService.generateResponse({
      //   conversationId,
      //   organizationId,
      //   messages: batchedContent,
      //   timeout: DEFAULT_AI_SETTINGS.aiTimeoutMs,
      // });

      // For now, just log and reset state
      this.logger.log(
        `AI batch ready for ${conversationId}: ${messageIds.length} messages batched`,
      );

      // Reset to AI_ACTIVE after processing
      await this.batchingService.updateAIState(conversationId, 'AI_ACTIVE');
    } catch (error) {
      this.logger.error(
        `Failed to process AI batch for ${conversationId}: ${error.message}`,
        error.stack,
      );

      // Reset state on error
      await this.batchingService.updateAIState(conversationId, 'AI_ACTIVE');

      throw error;
    }
  }
}
