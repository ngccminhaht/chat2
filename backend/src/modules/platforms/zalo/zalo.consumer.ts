import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { ZaloService } from './zalo.service';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';

/**
 * Zalo Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.zalo.webhooks
 */
@Controller()
export class ZaloConsumer {
  private readonly logger = new Logger(ZaloConsumer.name);

  constructor(private readonly zaloService: ZaloService) {}

  @MessagePattern(KAFKA_TOPICS.ZALO_WEBHOOKS)
  async handleWebhook(@Payload() payload: ZaloWebhookDto): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Zalo webhook`);

    try {
      await this.zaloService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
