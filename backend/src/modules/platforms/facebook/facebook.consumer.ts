import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookProcessorService } from '../core/services/webhook-processor.service';
import { Platform } from '@/common/constants';

/**
 * Facebook Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them via WebhookProcessorService.
 * Topic: platform.facebook.webhooks
 */
@Controller()
export class FacebookConsumer {
  private readonly logger = new Logger(FacebookConsumer.name);

  constructor(private readonly webhookProcessor: WebhookProcessorService) {}

  @MessagePattern(KAFKA_TOPICS.FACEBOOK_WEBHOOKS)
  async handleWebhook(@Payload() payload: unknown): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Facebook webhook`);

    const result = await this.webhookProcessor.process(Platform.FACEBOOK, payload);

    if (result.success) {
      this.logger.log(`✅ Processed ${result.messagesProcessed} messages`);
    } else {
      this.logger.error(`❌ Failed:`, result.errors);
    }
  }
}
