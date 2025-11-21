import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookRawEvent } from '@/infra/kafka/types/webhook.types';
import { FacebookService } from './facebook.service';
import { FacebookWebhookDto } from './dto/facebook-webhook.dto';

/**
 * Facebook Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.webhooks.raw (filter: platform === 'facebook')
 */
@Controller()
export class FacebookConsumer {
  private readonly logger = new Logger(FacebookConsumer.name);

  constructor(private readonly facebookService: FacebookService) {}

  @MessagePattern(KAFKA_TOPICS.WEBHOOKS_RAW)
  async handleWebhook(@Payload() event: WebhookRawEvent): Promise<void> {
    if (event.platform !== 'facebook') return;

    this.logger.log(`📨 Kafka: Processing Facebook webhook`);

    try {
      const payload: FacebookWebhookDto = event.payload;
      await this.facebookService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
