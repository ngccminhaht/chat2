import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import {
  KeycloakConnectModule,
  AuthGuard,
  RoleGuard,
} from 'nest-keycloak-connect';
import { EnvModule, EnvService } from './common/env';
import { KeycloakConfigService } from './common/keycloak';
import { KeycloakUserSyncGuard } from './common/guards';
import { RedisModule } from './infra/redis';
import { KafkaModule } from './infra/kafka/kafka.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { WidgetModule } from './modules/widget/widget.module';
import { QuickRepliesModule } from './modules/quick-replies/quick-replies.module';
import { AiAgentsModule } from './modules/ai-agents/ai-agents.module';
import { CustomersModule } from './modules/customers/customers.module';

@Module({
  imports: [
    // Environment service (Global) - Includes ConfigModule with validation
    EnvModule,

    // Keycloak authentication (Global)
    KeycloakConnectModule.registerAsync({
      useClass: KeycloakConfigService,
    }),

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

    // BullMQ for job queues (AI batching, etc.)
    BullModule.forRootAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        connection: {
          host: envService.get('REDIS_HOST'),
          port: envService.get('REDIS_PORT'),
          password: envService.get('REDIS_PASSWORD'),
        },
      }),
    }),

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

    // Unified platform module (handles all platform integrations)
    PlatformsModule,

    // Widget configuration API
    WidgetModule,

    // Quick replies templates
    QuickRepliesModule,

    // AI agents for automated responses
    AiAgentsModule,

    // Customer management (CRM)
    CustomersModule,
  ],
  providers: [
    // Global Keycloak guards - Order matters!
    // 1. AuthGuard: validates JWT token from Keycloak
    { provide: APP_GUARD, useClass: AuthGuard },
    // 2. KeycloakUserSyncGuard: syncs Keycloak user to MongoDB
    { provide: APP_GUARD, useClass: KeycloakUserSyncGuard },
    // 3. RoleGuard: checks @Roles decorator
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}
