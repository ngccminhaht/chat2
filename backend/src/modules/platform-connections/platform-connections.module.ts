import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlatformConnectionsController } from './platform-connections.controller';
import { PlatformConnectionsService } from './platform-connections.service';
import { ZaloOAuthController } from './zalo-oauth.controller';
import { ZaloOAuthService } from './zalo-oauth.service';
import { OAuthStateService } from './oauth-state.service';
import {
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas/platform-connection.schema';
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
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [PlatformConnectionsController, ZaloOAuthController],
  providers: [PlatformConnectionsService, ZaloOAuthService, OAuthStateService],
  exports: [PlatformConnectionsService, ZaloOAuthService, OAuthStateService],
})
export class PlatformConnectionsModule {}
