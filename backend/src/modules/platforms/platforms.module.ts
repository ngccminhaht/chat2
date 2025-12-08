import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import {
  Conversation,
  ConversationSchema,
  Message,
  MessageSchema,
  PlatformConnection,
  PlatformConnectionSchema,
} from '@/common/database/schemas';

// Common Platform Module
import {
  PlatformRegistryService,
  MessageProcessorService,
  FACEBOOK_ADAPTER,
  ZALO_ADAPTER,
  SHOPEE_ADAPTER,
} from '@/common/platform';

// Note: KafkaModule is global, no import needed

// Controllers
import { UnifiedWebhookController, UnifiedOAuthController } from './controllers';

// Consumers
import { WebhookConsumer, OutgoingMessageConsumer } from './consumers';

// Facebook Adapter
import {
  FacebookAdapter,
  FacebookWebhookHandler,
  FacebookOAuthHandler,
  FacebookSenderHandler,
} from './adapters/facebook';

// Zalo Adapter
import {
  ZaloAdapter,
  ZaloWebhookHandler,
  ZaloOAuthHandler,
  ZaloSenderHandler,
} from './adapters/zalo';

// Shopee Adapter
import {
  ShopeeAdapter,
  ShopeeWebhookHandler,
  ShopeeOAuthHandler,
  ShopeeSenderHandler,
} from './adapters/shopee';

/**
 * Platforms Module
 * Central module for all platform integrations (Facebook, Zalo, Shopee, etc.)
 *
 * Features:
 * - Unified webhook handling for all platforms
 * - Unified OAuth flows
 * - Unified message sending
 * - Platform-specific adapters
 */
@Module({
  imports: [
    // Database schemas
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformConnection.name, schema: PlatformConnectionSchema },
    ]),
    // Note: KafkaModule is @Global(), no need to import here
  ],
  controllers: [
    UnifiedWebhookController,
    UnifiedOAuthController,
  ],
  providers: [
    // Core Services
    PlatformRegistryService,
    MessageProcessorService,

    // Consumers
    WebhookConsumer,
    OutgoingMessageConsumer,

    // Facebook Adapter
    FacebookWebhookHandler,
    FacebookOAuthHandler,
    FacebookSenderHandler,
    FacebookAdapter,
    {
      provide: FACEBOOK_ADAPTER,
      useExisting: FacebookAdapter,
    },

    // Zalo Adapter
    ZaloWebhookHandler,
    ZaloOAuthHandler,
    ZaloSenderHandler,
    ZaloAdapter,
    {
      provide: ZALO_ADAPTER,
      useExisting: ZaloAdapter,
    },

    // Shopee Adapter
    ShopeeWebhookHandler,
    ShopeeOAuthHandler,
    ShopeeSenderHandler,
    ShopeeAdapter,
    {
      provide: SHOPEE_ADAPTER,
      useExisting: ShopeeAdapter,
    },
  ],
  exports: [
    PlatformRegistryService,
    MessageProcessorService,
  ],
})
export class PlatformsModule {}
