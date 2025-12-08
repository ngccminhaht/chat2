import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnvModule, EnvService } from './common/env';
import { RedisModule } from './infra/redis';
import { KafkaModule } from './infra/kafka/kafka.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MediaModule } from './modules/media/media.module';
import { FacebookModule } from './modules/facebook/facebook.module';
import { ZaloModule } from './modules/zalo/zalo.module';
import { ShopeeModule } from './modules/shopee/shopee.module';
import { PlatformsModule } from './modules/platforms/platforms.module';

@Module({
  imports: [
    // Environment service (Global) - Includes ConfigModule with validation
    EnvModule,

    // Redis service (Global)
    RedisModule,

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
    ConversationsModule,
    MessagesModule,
    WebhooksModule,
    WebsocketModule,
    ConnectionsModule,
    MediaModule,

    // Platform modules (legacy - to be deprecated)
    FacebookModule,
    ZaloModule,
    ShopeeModule,

    // New unified platform module
    PlatformsModule,
  ],
})
export class AppModule {}
