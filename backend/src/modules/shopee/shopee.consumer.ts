import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookRawEvent } from '@/infra/kafka/types/webhook.types';
import { ShopeeService } from './shopee.service';
import { ShopeeWebhookDto } from './dto/shopee-webhook.dto';

/**
 * Shopee Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.webhooks.raw (filter: platform === 'shopee')
 */
@Controller()
export class ShopeeConsumer {
  private readonly logger = new Logger(ShopeeConsumer.name);

  constructor(private readonly shopeeService: ShopeeService) {}

  @MessagePattern(KAFKA_TOPICS.WEBHOOKS_RAW)
  async handleWebhook(@Payload() event: WebhookRawEvent): Promise<void> {
    if (event.platform !== 'shopee') return;

    this.logger.log(`📨 Kafka: Processing Shopee webhook`);

    try {
      const payload: ShopeeWebhookDto = event.payload;
      await this.shopeeService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
