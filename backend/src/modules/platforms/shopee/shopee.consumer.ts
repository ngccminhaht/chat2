import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookProcessorService } from '../core/services/webhook-processor.service';
import { Platform } from '@/common/constants';

/**
 * Shopee Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them via WebhookProcessorService.
 * Topic: platform.shopee.webhooks
 */
@Controller()
export class ShopeeConsumer {
  private readonly logger = new Logger(ShopeeConsumer.name);

  constructor(private readonly webhookProcessor: WebhookProcessorService) {}

  @MessagePattern(KAFKA_TOPICS.SHOPEE_WEBHOOKS)
  async handleWebhook(@Payload() payload: unknown): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Shopee webhook`);

    const result = await this.webhookProcessor.process(Platform.SHOPEE, payload);

    if (result.success) {
      this.logger.log(`✅ Processed ${result.messagesProcessed} messages`);
    } else {
      this.logger.error(`❌ Failed:`, result.errors);
    }
  }
}
