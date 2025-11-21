import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookRawEvent } from '@/infra/kafka/types/webhook.types';
import { ZaloService } from './zalo.service';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';

/**
 * Zalo Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.webhooks.raw (filter: platform === 'zalo')
 */
@Controller()
export class ZaloConsumer {
  private readonly logger = new Logger(ZaloConsumer.name);

  constructor(private readonly zaloService: ZaloService) {}

  @MessagePattern(KAFKA_TOPICS.WEBHOOKS_RAW)
  async handleWebhook(@Payload() event: WebhookRawEvent): Promise<void> {
    if (event.platform !== 'zalo') return;

    this.logger.log(`📨 Kafka: Processing Zalo webhook`);

    try {
      const payload: ZaloWebhookDto = event.payload;
      await this.zaloService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
