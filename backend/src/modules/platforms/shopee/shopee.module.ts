import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopeeController } from './shopee.controller';
import { ShopeeConsumer } from './shopee.consumer';
import { ShopeeService } from './shopee.service';
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
import { OrganizationsModule } from '@/modules/organizations/organizations.module';

/**
 * Shopee Module
 *
 * Handles Shopee integration:
 * - HTTP: GET/POST /api/shopee/webhook (verification, publish to Kafka)
 * - Kafka Consumer: uses WebhookProcessorService via PlatformCoreModule
 * - OAuth flow for connecting Shopee shops
 * - Outbound messaging
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    ConnectionsModule, // For ShopeeOAuthService
    WebhooksModule, // For WebhookPublisherService
    WebsocketModule, // For WebsocketGateway
    OrganizationsModule, // For organization slug lookup
    // Note: AI batching handled by InboundMessageHandlerModule (@Global)
  ],
  controllers: [ShopeeController, ShopeeConsumer],
  providers: [ShopeeService],
  exports: [ShopeeService],
})
export class ShopeeModule {}
