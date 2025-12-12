import { Module } from '@nestjs/common';
import { PlatformCoreModule } from './core/core.module';
import { AdaptersModule } from './adapters/adapters.module';
import { FacebookModule } from './facebook/facebook.module';
import { ZaloModule } from './zalo/zalo.module';
import { ShopeeModule } from './shopee/shopee.module';

/**
 * Platforms Module
 * Aggregates all platform integrations (Facebook, Zalo, Shopee, TikTok)
 *
 * Architecture:
 * - PlatformCoreModule: Shared services (Registry, WebhookProcessor, MessageSender)
 * - AdaptersModule: Platform-specific adapters implementing IPlatformAdapter
 * - Platform modules: HTTP endpoints, OAuth, Kafka consumers
 *
 * Each platform module is self-contained with:
 * - Controller: HTTP endpoints for webhooks and OAuth
 * - Service: Platform-specific business logic (OAuth, API calls)
 * - Consumer: Kafka message processing (uses WebhookProcessorService)
 * - DTOs: Request/response validation
 */
@Module({
  imports: [
    PlatformCoreModule,
    AdaptersModule,
    FacebookModule,
    ZaloModule,
    ShopeeModule,
  ],
})
export class PlatformsModule {}
