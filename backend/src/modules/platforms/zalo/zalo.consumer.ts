import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookProcessorService } from '../core/services/webhook-processor.service';
import { Platform } from '@/common/constants';

/**
 * Zalo Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them via WebhookProcessorService.
 * Topic: platform.zalo.webhooks
 */
@Controller()
export class ZaloConsumer {
  private readonly logger = new Logger(ZaloConsumer.name);

  constructor(private readonly webhookProcessor: WebhookProcessorService) {}

  @MessagePattern(KAFKA_TOPICS.ZALO_WEBHOOKS)
  async handleWebhook(@Payload() payload: unknown): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Zalo webhook`);

    const result = await this.webhookProcessor.process(Platform.ZALO, payload);

    if (result.success) {
      this.logger.log(`✅ Processed ${result.messagesProcessed} messages`);
    } else {
      this.logger.error(`❌ Failed:`, result.errors);
    }
  }
}
