import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { FacebookService } from './facebook.service';
import { FacebookWebhookDto } from './dto/facebook-webhook.dto';

/**
 * Facebook Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them asynchronously.
 * Topic: platform.facebook.webhooks
 */
@Controller()
export class FacebookConsumer {
  private readonly logger = new Logger(FacebookConsumer.name);

  constructor(private readonly facebookService: FacebookService) {}

  @MessagePattern(KAFKA_TOPICS.FACEBOOK_WEBHOOKS)
  async handleWebhook(@Payload() payload: FacebookWebhookDto): Promise<void> {
    this.logger.log(`📨 Kafka: Processing Facebook webhook`);

    try {
      await this.facebookService.processWebhook(payload);
      this.logger.log(`✅ Processed`);
    } catch (error) {
      this.logger.error(`❌ Failed:`, error);
    }
  }
}
