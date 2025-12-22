/**
 * AI Batching Module
 * Provides message batching with BullMQ debounce for AI responses
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageSchema,
} from '@/common/database/schemas/message.schema';
import { AIBatchingService, AI_BATCH_QUEUE } from './ai-batching.service';
import { AIBatchingProcessor } from './ai-batching.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: AI_BATCH_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs for debugging
        attempts: 1, // No retries - AI batch is time-sensitive
      },
    }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  providers: [AIBatchingService, AIBatchingProcessor],
  exports: [AIBatchingService],
})
export class AIBatchingModule {}
