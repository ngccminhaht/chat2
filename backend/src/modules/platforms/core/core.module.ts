/**
 * Platform Core Module
 * Provides shared platform infrastructure:
 * - PlatformRegistry: Factory to get platform adapters
 * - WebhookProcessorService: Unified webhook processing
 * - MessageSenderService: Unified outbound message handling
 * - MessageSenderConsumer: Kafka consumer for outbound messages
 */

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageSchema,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas/platform-connection.schema';
import { PlatformRegistry } from './services/platform.registry';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { MessageSenderService } from './services/message-sender.service';
import { MessageSenderConsumer } from '@/infra/kafka/consumers/message-sender.consumer';
import { WebsocketModule } from '@/modules/websocket/websocket.module';
import { AIBatchingModule } from '@/modules/ai-batching/ai-batching.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    WebsocketModule,
    AIBatchingModule,
  ],
  controllers: [MessageSenderConsumer],
  providers: [
    PlatformRegistry,
    WebhookProcessorService,
    MessageSenderService,
  ],
  exports: [
    PlatformRegistry,
    WebhookProcessorService,
    MessageSenderService,
  ],
})
export class PlatformCoreModule {}
