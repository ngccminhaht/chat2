import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { Message, MessageSchema } from '@/common/database/schemas/message.schema';
import { Conversation, ConversationSchema } from '@/common/database/schemas/conversation.schema';
import { PlatformConnection, PlatformConnectionSchema } from '@/common/database/schemas/platform-connection.schema';
import { ConnectionsModule } from '@/modules/connections/connections.module';
import { WebsocketModule } from '@/modules/websocket/websocket.module';
import { FacebookModule } from '@/modules/facebook/facebook.module';
import { ZaloModule } from '@/modules/zalo/zalo.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    ConnectionsModule,
    WebsocketModule,
    FacebookModule,
    ZaloModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
