import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from './common/kafka/kafka.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { PlatformConnectionsModule } from './modules/platform-connections/platform-connections.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    // Config module - load .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // MongoDB connection
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/omnichat'),

    // Kafka infrastructure (Global)
    KafkaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ConversationsModule,
    MessagesModule,
    WebhooksModule,
    WebsocketModule,
    PlatformConnectionsModule,
    MediaModule,
  ],
})
export class AppModule {}
