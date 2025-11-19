import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ZaloOAuthController } from './zalo-oauth.controller';
import { ZaloOAuthService } from './zalo-oauth.service';
import { ShopeeOAuthController } from './shopee-oauth.controller';
import { ShopeeOAuthService } from './shopee-oauth.service';
import { FacebookOAuthController } from './facebook-oauth.controller';
import { FacebookOAuthService } from './facebook-oauth.service';
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
import { WebsocketModule } from '@/modules/websocket/websocket.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    WebsocketModule,
  ],
  controllers: [
    ConnectionsController,
    ZaloOAuthController,
    ShopeeOAuthController,
    FacebookOAuthController,
  ],
  providers: [
    ConnectionsService,
    ZaloOAuthService,
    ShopeeOAuthService,
    FacebookOAuthService,
    OAuthStateService,
  ],
  exports: [
    ConnectionsService,
    ZaloOAuthService,
    ShopeeOAuthService,
    FacebookOAuthService,
    OAuthStateService,
  ],
})
export class ConnectionsModule {}
