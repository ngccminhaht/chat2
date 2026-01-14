import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { KAFKA_TOPICS } from "@/infra/kafka/kafka.config";
import { WebhookProcessorService } from "../core/services/webhook-processor.service";
import { Platform } from "@/common/constants";

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
    const fbPayload = payload as any;
    const pageId = fbPayload?.entry?.[0]?.id;
    const messagingCount = fbPayload?.entry?.[0]?.messaging?.length || 0;
    const changesCount = fbPayload?.entry?.[0]?.changes?.length || 0;

    this.logger.log(`📨 Kafka: Processing Facebook webhook`);
    this.logger.log(`  Page ID: ${pageId}`);
    this.logger.log(
      `  Events: ${messagingCount} messaging, ${changesCount} changes`
    );

    // Log comment/feed events specifically
    if (fbPayload?.entry) {
      for (const entry of fbPayload.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === "comments" || change.field === "feed") {
              this.logger.log(`  💬 Comment/Feed event detected:`);
              this.logger.log(`    Field: ${change.field}`);
              this.logger.log(`    Value: ${JSON.stringify(change.value)}`);
            }
          }
        }
      }
    }

    const result = await this.webhookProcessor.process(
      Platform.FACEBOOK,
      payload
    );

    if (result.success) {
      this.logger.log(`✅ Processed ${result.messagesProcessed} messages`);
    } else {
      this.logger.error(`❌ Failed:`, result.errors);
    }
  }
}
