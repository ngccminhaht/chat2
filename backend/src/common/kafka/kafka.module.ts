import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaProducerService } from './kafka-producer.service';
import { WebhookProcessorConsumer } from './consumers/webhook-processor.consumer';
import { WebSocketBridgeConsumer } from './consumers/websocket-bridge.consumer';
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
import { WebsocketModule } from '@/modules/websocket/websocket.module';
import { WebhooksModule } from '@/modules/webhooks/webhooks.module';

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
    WebsocketModule, // Import WebSocket module for WebSocketBridgeConsumer
    WebhooksModule, // Import Webhooks module for FacebookWebhookService
  ],
  controllers: [WebhookProcessorConsumer, WebSocketBridgeConsumer],
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
