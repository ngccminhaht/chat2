import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FacebookController } from './facebook.controller';
import { FacebookConsumer } from './facebook.consumer';
import { FacebookService } from './facebook.service';
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
 * Facebook Module
 *
 * Handles all Facebook Messenger integration:
 * - HTTP: GET/POST /api/facebook/webhook
 * - Kafka Consumer: platform.webhooks.raw
 * - OAuth flow for connecting Facebook Pages
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    ConnectionsModule, // For FacebookOAuthService
    WebhooksModule, // For WebhookPublisherService
    WebsocketModule, // For WebsocketGateway
  ],
  controllers: [FacebookController, FacebookConsumer],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class FacebookModule {}
