/**
 * Kafka Mock for Testing
 * Uses @js-ak/kafkajs-mock to mock KafkaJS
 */

import { kafkaJs } from '@js-ak/kafkajs-mock';
import { KafkaProducerService } from '../../infra/kafka/kafka-producer.service';

/**
 * Create a mock KafkaProducerService for testing
 */
export const createMockKafkaProducer = () => {
  const publishedMessages: Array<{
    topic: string;
    key?: string;
    value: any;
    partition?: number;
    headers?: Record<string, string>;
  }> = [];

  const mockProducer = {
    publish: jest.fn().mockImplementation(async (topic, message) => {
      publishedMessages.push({ topic, ...message });
      return [{ partition: 0, offset: '0' }];
    }),
    publishBatch: jest.fn().mockImplementation(async (topic, messages) => {
      messages.forEach((msg: any) => publishedMessages.push({ topic, ...msg }));
      return messages.map(() => ({ partition: 0, offset: '0' }));
    }),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  return {
    mockProducer,
    publishedMessages,
    getPublishedMessages: () => publishedMessages,
    clearPublishedMessages: () => (publishedMessages.length = 0),
  };
};

/**
 * Mock KafkaProducerService provider for NestJS testing module
 */
export const mockKafkaProducerProvider = {
  provide: KafkaProducerService,
  useFactory: () => {
    const { mockProducer } = createMockKafkaProducer();
    return mockProducer;
  },
};

/**
 * Create a trackable mock KafkaProducerService
 * Returns the mock and helper functions to inspect published messages
 */
export const createTrackableKafkaProducer = () => {
  const { mockProducer, publishedMessages, clearPublishedMessages } =
    createMockKafkaProducer();

  return {
    provider: {
      provide: KafkaProducerService,
      useValue: mockProducer,
    },
    getPublishedMessages: () => publishedMessages,
    clearPublishedMessages,
    getMessagesByTopic: (topic: string) =>
      publishedMessages.filter((m) => m.topic === topic),
  };
};

/**
 * Export MockKafka for direct usage with full KafkaJS API mock
 */
export const MockKafka = kafkaJs.Kafka;
