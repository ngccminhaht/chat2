import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookController } from './webhook.controller';
import { WebhookPublisherService } from './webhook-publisher.service';
import { ZaloWebhookService } from './zalo-webhook.service';
import { ShopeeWebhookService } from './shopee-webhook.service';
import { FacebookWebhookService } from './facebook-webhook.service';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
  ],
  controllers: [WebhookController],
  providers: [WebhookPublisherService, ZaloWebhookService, ShopeeWebhookService, FacebookWebhookService],
  exports: [ZaloWebhookService, ShopeeWebhookService, FacebookWebhookService],
})
export class WebhooksModule {}
