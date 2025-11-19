/**
 * Kafka Topics Configuration
 * Based on CLAUDE.md architecture specification
 */

export const KAFKA_TOPICS = {
  // Raw webhook payloads (partitioned by platform + accountId)
  WEBHOOKS_RAW: 'platform.webhooks.raw',

  // Normalized inbound messages (partitioned by conversationId)
  MESSAGES_INCOMING: 'messages.incoming',

  // Messages to send to platforms (partitioned by conversationId)
  MESSAGES_OUTGOING: 'messages.outgoing',

  // Delivery receipts, read status (partitioned by messageId)
  MESSAGES_STATUS: 'messages.status',

  // Real-time events for frontend (partitioned by userId)
  WEBSOCKET_NOTIFICATIONS: 'websocket.notifications',
} as const;

/**
 * Kafka Consumer Groups
 */
export const KAFKA_CONSUMER_GROUPS = {
  WEBHOOK_PROCESSOR: 'webhook-processor-group',
  MESSAGE_SENDER: 'message-sender-group',
  WEBSOCKET_BRIDGE: 'websocket-bridge-group',
} as const;

import { EnvService } from '../env';

/**
 * Kafka Connection Configuration
 */
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  retry?: {
    retries: number;
    initialRetryTime?: number;
    maxRetryTime?: number;
  };
}

export const getKafkaConfig = (envService?: EnvService): any => {
  // Support both EnvService (preferred) and fallback to process.env for bootstrap
  const clientId = envService
    ? envService.get('KAFKA_CLIENT_ID')
    : process.env.KAFKA_CLIENT_ID || 'omnichat-backend';

  const brokers = envService
    ? envService.get('KAFKA_BROKERS').split(',')
    : (process.env.KAFKA_BROKERS || 'localhost:8311').split(',');

  return {
    clientId,
    brokers,
    connectionTimeout: 10000,
    requestTimeout: 30000,
    retry: {
      retries: 8,
      initialRetryTime: 100,
      maxRetryTime: 30000,
    },
    logLevel: 2, // ERROR level (1=ERROR, 2=WARN, 4=INFO, 5=DEBUG)
  };
};
