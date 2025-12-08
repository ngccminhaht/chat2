import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { KAFKA_TOPICS } from '@/common/constants';
import { PlatformRegistryService, NormalizedIncomingMessage } from '@/common/platform';
import { RawWebhookPayload } from '@/common/platform/types/kafka-events.type';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { getKafkaConfig, KAFKA_CONSUMER_GROUPS } from '@/infra/kafka/kafka.config';
import { EnvService } from '@/common/env';

/**
 * Webhook Consumer
 * Consumes raw webhook payloads from Kafka, normalizes them, and publishes to messages.incoming
 *
 * Flow:
 * 1. Consume from platform.webhooks.raw
 * 2. Get platform adapter
 * 3. Parse and normalize webhook events
 * 4. Publish normalized messages to messages.incoming
 */
@Injectable()
export class WebhookConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isRunning = false;

  constructor(
    private readonly envService: EnvService,
    private readonly platformRegistry: PlatformRegistryService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async onModuleInit() {
    const config = getKafkaConfig(this.envService);
    this.kafka = new Kafka(config);

    this.consumer = this.kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.WEBHOOK_PROCESSOR,
    });

    try {
      await this.consumer.connect();
      this.logger.log('✅ Webhook Consumer connected');

      await this.consumer.subscribe({
        topic: KAFKA_TOPICS.WEBHOOKS_RAW,
        fromBeginning: false,
      });

      await this.startConsuming();
    } catch (error) {
      this.logger.error('❌ Failed to initialize Webhook Consumer:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.logger.log('Webhook Consumer disconnected');
    }
  }

  /**
   * Start consuming messages
   */
  private async startConsuming(): Promise<void> {
    this.isRunning = true;

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.logger.log(`📥 Consuming from ${KAFKA_TOPICS.WEBHOOKS_RAW}`);
  }

  /**
   * Handle a single webhook message from Kafka
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    if (!message.value) {
      this.logger.warn('Received empty message');
      return;
    }

    try {
      const rawPayload: RawWebhookPayload = JSON.parse(message.value.toString());
      const { platform, platformAccountId, data } = rawPayload;

      this.logger.debug(
        `Processing webhook: ${platform}:${platformAccountId} [partition=${partition}]`,
      );

      // Get platform adapter
      const adapter = this.platformRegistry.getAdapter(platform);

      // Parse webhook into events
      const events = adapter.webhook.parseWebhook(data);

      if (events.length === 0) {
        this.logger.debug(`No events parsed from webhook`);
        return;
      }

      // Process each event
      for (const event of events) {
        // Check if this is a message event
        if (!adapter.webhook.isMessageEvent(event)) {
          this.logger.debug(`Skipping non-message event: ${event.type}`);
          continue;
        }

        // Normalize message
        const normalizedMessage = adapter.webhook.normalizeMessage(event);

        if (!normalizedMessage) {
          this.logger.debug(`Event did not produce a normalized message`);
          continue;
        }

        // Publish to messages.incoming topic
        await this.publishNormalizedMessage(normalizedMessage);
      }
    } catch (error) {
      this.logger.error(`Failed to process webhook message: ${error.message}`, error.stack);
      // Don't throw - we don't want to stop the consumer
      // Message will be considered processed and offset committed
    }
  }

  /**
   * Publish normalized message to messages.incoming topic
   */
  private async publishNormalizedMessage(
    message: NormalizedIncomingMessage,
  ): Promise<void> {
    try {
      await this.kafkaProducer.publish(KAFKA_TOPICS.MESSAGES_INCOMING, {
        key: message.platformConversationId,
        value: {
          ...message,
          // Serialize Date to ISO string for Kafka
          timestamp: message.timestamp.toISOString(),
        },
      });

      this.logger.debug(
        `Published normalized message to ${KAFKA_TOPICS.MESSAGES_INCOMING}: ` +
        `${message.platform}:${message.platformMessageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish normalized message: ${error.message}`,
      );
      throw error;
    }
  }
}
