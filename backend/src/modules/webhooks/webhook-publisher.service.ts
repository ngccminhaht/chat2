import { Injectable, Logger } from "@nestjs/common";
import { KafkaProducerService } from "@/infra/kafka/kafka-producer.service";
import { KAFKA_TOPICS } from "@/infra/kafka/kafka.config";
import { randomUUID } from "crypto";

/**
 * Webhook Publisher Service
 * Publishes raw webhook events to Kafka for asynchronous processing
 */
@Injectable()
export class WebhookPublisherService {
  private readonly logger = new Logger(WebhookPublisherService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  /**
   * Publish raw webhook event to Kafka
   * Returns immediately after publishing to platform-specific topic
   */
  async publishWebhookEvent(
    platform: "facebook" | "zalo" | "tiktok" | "shopee",
    payload: any,
    signature?: string
  ): Promise<void> {
    const eventId = randomUUID();
    const platformAccountId = this.extractPlatformAccountId(platform, payload);

    try {
      // Get platform-specific topic
      const topic = this.getPlatformTopic(platform);

      // Partition by platform accountId for ordered processing per account
      const partitionKey = `${platform}:${platformAccountId}`;

      await this.kafkaProducer.publish(topic, {
        key: partitionKey,
        value: payload,
        headers: {
          platform,
          eventId,
          signature: signature || '',
        },
      });

      this.logger.log(
        `✅ Published to ${topic}: ${this.extractEventName(platform, payload)} (ID: ${eventId})`
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to publish webhook event to Kafka: ${platform}`,
        error
      );
      throw error;
    }
  }

  /**
   * Get platform-specific Kafka topic
   */
  private getPlatformTopic(platform: string): string {
    switch (platform) {
      case 'facebook':
        return KAFKA_TOPICS.FACEBOOK_WEBHOOKS;
      case 'zalo':
        return KAFKA_TOPICS.ZALO_WEBHOOKS;
      case 'tiktok':
        return KAFKA_TOPICS.TIKTOK_WEBHOOKS;
      case 'shopee':
        return KAFKA_TOPICS.SHOPEE_WEBHOOKS;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Extract platform account ID from webhook payload
   */
  private extractPlatformAccountId(platform: string, payload: any): string {
    switch (platform) {
      case "zalo":
        // OA ID is recipient.id, NOT app_id (which is the Zalo application ID)
        return payload.recipient?.id || payload.app_id || "unknown";
      case "facebook":
        return payload.entry?.[0]?.id || "unknown";
      case "tiktok":
        return payload.shop_id || "unknown";
      case "shopee":
        return payload.shop_id || "unknown";
      default:
        return "unknown";
    }
  }

  /**
   * Extract event name from webhook payload
   */
  private extractEventName(platform: string, payload: any): string {
    switch (platform) {
      case "zalo":
        return payload.event_name || "unknown";
      case "facebook":
        return payload.entry?.[0]?.messaging?.[0]?.message
          ? "message"
          : "unknown";
      case "tiktok":
      case "shopee":
        return payload.event || "unknown";
      default:
        return "unknown";
    }
  }
}
