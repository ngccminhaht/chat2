import { Module } from '@nestjs/common';
import { WebhookPublisherService } from './webhook-publisher.service';

/**
 * Webhooks Module
 *
 * Provides shared webhook infrastructure:
 * - WebhookPublisherService: Publishes webhook events to Kafka
 *
 * Platform-specific webhook handling is in dedicated modules:
 * - FacebookModule: /api/facebook/webhook
 * - ZaloModule: /api/zalo/webhook
 * - ShopeeModule: /api/shopee/webhook
 */
@Module({
  providers: [WebhookPublisherService],
  exports: [WebhookPublisherService],
})
export class WebhooksModule {}
