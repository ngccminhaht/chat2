import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnvModule, EnvService } from './common/env';
import { KafkaModule } from './common/kafka/kafka.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    // Environment service (Global) - Includes ConfigModule with validation
    EnvModule,

    // MongoDB connection - use EnvService
    MongooseModule.forRootAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        uri: envService.get('MONGODB_URI'),
      }),
    }),

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
    ConnectionsModule,
    MediaModule,
  ],
})
export class AppModule {}
