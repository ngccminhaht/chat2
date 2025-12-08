import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZaloController } from './zalo.controller';
import { ZaloConsumer } from './zalo.consumer';
import { ZaloService } from './zalo.service';
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
import { ConnectionsModule } from '@/modules/connections/connections.module';
import { WebhooksModule } from '@/modules/webhooks/webhooks.module';
import { WebsocketModule } from '@/modules/websocket/websocket.module';

/**
 * Zalo Module
 *
 * Handles all Zalo OA integration:
 * - HTTP: POST /api/zalo/webhook
 * - Kafka Consumer: platform.webhooks.raw
 * - OAuth flow for connecting Zalo OA
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    ConnectionsModule, // For ZaloOAuthService
    WebhooksModule, // For WebhookPublisherService
    WebsocketModule, // For WebsocketGateway
  ],
  controllers: [ZaloController, ZaloConsumer],
  providers: [ZaloService],
  exports: [ZaloService],
})
export class ZaloModule {}
