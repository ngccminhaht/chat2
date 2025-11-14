import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZaloWebhookController } from './zalo/zalo-webhook.controller';
import { ZaloWebhookService } from './zalo/zalo-webhook.service';
import {
  Conversation,
  ConversationSchema,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageSchema,
} from '@/common/database/schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ZaloWebhookController],
  providers: [ZaloWebhookService],
  exports: [ZaloWebhookService],
})
export class WebhooksModule {}
