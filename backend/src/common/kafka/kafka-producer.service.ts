import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { getKafkaConfig } from './kafka.config';
import { EnvService } from '../env';

/**
 * Kafka Producer Service
 * Handles publishing messages to Kafka topics
 */
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(private readonly envService: EnvService) {}

  async onModuleInit() {
    const config = getKafkaConfig(this.envService);
    this.kafka = new Kafka(config);
    this.producer = this.kafka.producer();

    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('✅ Kafka Producer connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect Kafka Producer:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.logger.log('Kafka Producer disconnected');
    }
  }

  /**
   * Publish a single message to a topic
   */
  async publish(
    topic: string,
    message: {
      key?: string;
      value: any;
      partition?: number;
      headers?: Record<string, string>;
    },
  ): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      throw new Error('Kafka Producer is not connected');
    }

    try {
      const record: ProducerRecord = {
        topic,
        messages: [
          {
            key: message.key,
            value: JSON.stringify(message.value),
            partition: message.partition,
            headers: message.headers,
          },
        ],
      };

      const metadata = await this.producer.send(record);

      this.logger.debug(`Published to ${topic}:`, {
        key: message.key,
        partition: metadata[0]?.partition,
        offset: metadata[0]?.offset,
      });

      return metadata;
    } catch (error) {
      this.logger.error(`Failed to publish to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish multiple messages to a topic in a batch
   */
  async publishBatch(
    topic: string,
    messages: Array<{
      key?: string;
      value: any;
      partition?: number;
      headers?: Record<string, string>;
    }>,
  ): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      throw new Error('Kafka Producer is not connected');
    }

    try {
      const record: ProducerRecord = {
        topic,
        messages: messages.map((msg) => ({
          key: msg.key,
          value: JSON.stringify(msg.value),
          partition: msg.partition,
          headers: msg.headers,
        })),
      };

      const metadata = await this.producer.send(record);

      this.logger.debug(`Published batch to ${topic}: ${messages.length} messages`);

      return metadata;
    } catch (error) {
      this.logger.error(`Failed to publish batch to ${topic}:`, error);
      throw error;
    }
  }
}
