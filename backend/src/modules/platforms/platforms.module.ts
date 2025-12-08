import { Module } from '@nestjs/common';
import { FacebookModule } from './facebook/facebook.module';
import { ZaloModule } from './zalo/zalo.module';
import { ShopeeModule } from './shopee/shopee.module';

/**
 * Platforms Module
 * Aggregates all platform integrations (Facebook, Zalo, Shopee)
 *
 * Each platform module is self-contained with:
 * - Controller: HTTP endpoints for webhooks and OAuth
 * - Service: Business logic for the platform
 * - Consumer: Kafka message processing
 * - DTOs: Request/response validation
 */
@Module({
  imports: [
    FacebookModule,
    ZaloModule,
    ShopeeModule,
  ],
})
export class PlatformsModule {}
