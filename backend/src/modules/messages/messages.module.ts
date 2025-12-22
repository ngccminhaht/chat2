import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { Message, MessageSchema } from '@/common/database/schemas/message.schema';
import { Conversation, ConversationSchema } from '@/common/database/schemas/conversation.schema';
import { PlatformConnection, PlatformConnectionSchema } from '@/common/database/schemas/platform-connection.schema';
import { WebsocketModule } from '@/modules/websocket/websocket.module';
import { AIBatchingModule } from '@/modules/ai-batching/ai-batching.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    // Note: KafkaModule is @Global(), no need to import here
    // WebsocketModule for VisitorMessageService (web chat)
    forwardRef(() => WebsocketModule),
    AIBatchingModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
