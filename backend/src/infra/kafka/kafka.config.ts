/**
 * Kafka Topics Configuration
 * Based on CLAUDE.md architecture specification
 */

export const KAFKA_TOPICS = {
  // Platform-specific webhook topics
  FACEBOOK_WEBHOOKS: "platform.facebook.webhooks",
  ZALO_WEBHOOKS: "platform.zalo.webhooks",
  TIKTOK_WEBHOOKS: "platform.tiktok.webhooks",
  SHOPEE_WEBHOOKS: "platform.shopee.webhooks",

  // Normalized inbound messages (partitioned by conversationId)
  MESSAGES_INCOMING: "messages.incoming",

  // Messages to send to platforms (partitioned by conversationId)
  MESSAGES_OUTGOING: "messages.outgoing",

  // Delivery receipts, read status (partitioned by messageId)
  MESSAGES_STATUS: "messages.status",

  // Real-time events for frontend (partitioned by userId)
  WEBSOCKET_NOTIFICATIONS: "websocket.notifications",
} as const;

/**
 * Kafka Consumer Groups
 */
export const KAFKA_CONSUMER_GROUPS = {
  MESSAGE_SENDER: "message-sender-group",
  WEBSOCKET_BRIDGE: "websocket-bridge-group",
} as const;

import { EnvService } from "@/common/env";

/**
 * Kafka Connection Configuration
 */
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  connectionTimeout: number;
  requestTimeout: number;
  logLevel: number;
  retry: {
    retries: number;
    initialRetryTime: number;
    maxRetryTime: number;
  };
}

export const getKafkaConfig = (envService: EnvService): KafkaConfig => {
  return {
    clientId: envService.get("KAFKA_CLIENT_ID"),
    brokers: envService.get("KAFKA_BROKERS"),
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
