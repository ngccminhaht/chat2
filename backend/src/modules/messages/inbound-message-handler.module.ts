/**
 * Inbound Message Handler Module
 *
 * Global module providing InboundMessageHandlerService to all consumers.
 * Used by: WebhookProcessorService, VisitorMessageService
 */

import { Global, Module } from "@nestjs/common";
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
  Customer,
  CustomerSchema,
} from "@/common/database/schemas/customer.schema";
import { AIBatchingModule } from "@/modules/ai-batching/ai-batching.module";
import { InboundMessageHandlerService } from "./inbound-message-handler.service";

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    AIBatchingModule,
  ],
  providers: [InboundMessageHandlerService],
  exports: [InboundMessageHandlerService],
})
export class InboundMessageHandlerModule {}
