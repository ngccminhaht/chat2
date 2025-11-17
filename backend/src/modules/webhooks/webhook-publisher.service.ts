import { Injectable, Logger } from "@nestjs/common";
import { KafkaProducerService } from "@/common/kafka/kafka-producer.service";
import { KAFKA_TOPICS } from "@/common/kafka/kafka.config";
import { WebhookRawEvent } from "@/common/kafka/types/webhook.types";
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
   * Returns immediately after publishing to topic
   */
  async publishWebhookEvent(
    platform: "facebook" | "zalo" | "tiktok" | "shopee",
    payload: any,
    signature?: string
  ): Promise<void> {
    const eventId = randomUUID();

    // Extract platform account ID based on platform
    const platformAccountId = this.extractPlatformAccountId(platform, payload);

    const event: WebhookRawEvent = {
      eventId,
      platform,
      platformAccountId,
      eventName: this.extractEventName(platform, payload),
      payload,
      signature,
      timestamp: Date.now(),
    };

    try {
      // Partition by platform + accountId for ordered processing per account
      const partitionKey = `${platform}:${platformAccountId}`;

      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBHOOKS_RAW, {
        key: partitionKey,
        value: event,
        headers: {
          platform,
          eventId,
        },
      });

      this.logger.log(
        `✅ Published webhook event to Kafka: ${platform}/${
          event.eventName
        } (ID: ${eventId}) + \n payload: ${JSON.stringify(payload, null, 2)}`
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to publish webhook event to Kafka: ${platform}/${event.eventName}`,
        error
      );
      throw error;
    }
  }

  /**
   * Extract platform account ID from webhook payload
   */
  private extractPlatformAccountId(platform: string, payload: any): string {
    switch (platform) {
      case "zalo":
        return payload.app_id || "unknown";
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
