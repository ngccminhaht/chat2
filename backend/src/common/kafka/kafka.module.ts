import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaProducerService } from './kafka-producer.service';
import { WebhookProcessorConsumer } from './consumers/webhook-processor.consumer';
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

/**
 * Global Kafka Module
 * Provides Kafka producer and consumers
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
  ],
  providers: [KafkaProducerService, WebhookProcessorConsumer],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
