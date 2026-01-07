/**
 * AI Batching Module
 * Provides message batching with BullMQ debounce for AI responses
 */

import { Module, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Conversation,
  ConversationSchema,
} from "@/common/database/schemas/conversation.schema";
import {
  Message,
  MessageSchema,
} from "@/common/database/schemas/message.schema";
import {
  Organization,
  OrganizationSchema,
} from "@/common/database/schemas/organization.schema";
import {
  Customer,
  CustomerSchema,
} from "@/common/database/schemas/customer.schema";
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from "@/common/database/schemas/platform-connection.schema";
import { AIBatchingService, AI_BATCH_QUEUE } from "./ai-batching.service";
import { AIBatchingProcessor } from "./ai-batching.processor";
import { AIResponseService } from "./ai-response.service";
import { AI_API_CALL_QUEUE } from "./ai-api-call.queue";
import { AIAPICallProcessor } from "./ai-api-call.processor";
import { DEFAULT_AI_RETRY_CONFIG } from "./ai-api-retry.config";
import { WebsocketModule } from "@/modules/websocket/websocket.module";
import { AiAgentsModule } from "@/modules/ai-agents/ai-agents.module";
import { KafkaModule } from "@/infra/kafka/kafka.module";

@Module({
  imports: [
    // AI Batch Queue - no retries (time-sensitive)
    BullModule.registerQueue({
      name: AI_BATCH_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs for debugging
        attempts: 1, // No retries - AI batch is time-sensitive
      },
    }),
    // AI API Call Queue - with retry (persistent, survives app restart)
    BullModule.registerQueue({
      name: AI_API_CALL_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs
        attempts: DEFAULT_AI_RETRY_CONFIG.maxRetries + 1, // 1 initial + 3 retries = 4 total
        backoff: {
          type: "exponential",
          delay: DEFAULT_AI_RETRY_CONFIG.initialDelayMs, // 2000ms initial delay
        },
        timeout: DEFAULT_AI_RETRY_CONFIG.timeoutMs, // 60s timeout per attempt
      },
    }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    forwardRef(() => WebsocketModule),
    AiAgentsModule,
    KafkaModule,
  ],
  providers: [
    AIBatchingService,
    AIBatchingProcessor,
    AIResponseService,
    AIAPICallProcessor,
  ],
  exports: [AIBatchingService, AIResponseService],
})
export class AIBatchingModule {}
