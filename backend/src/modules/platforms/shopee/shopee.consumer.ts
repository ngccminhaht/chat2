import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { ShopeeService } from './shopee.service';
import { ShopeeWebhookDto } from './dto/shopee-webhook.dto';

/**
 * Shopee Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.shopee.webhooks
 */
@Controller()
export class ShopeeConsumer {
  private readonly logger = new Logger(ShopeeConsumer.name);

  constructor(private readonly shopeeService: ShopeeService) {}

  @MessagePattern(KAFKA_TOPICS.SHOPEE_WEBHOOKS)
  async handleWebhook(@Payload() payload: ShopeeWebhookDto): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Shopee webhook`);

    try {
      await this.shopeeService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
