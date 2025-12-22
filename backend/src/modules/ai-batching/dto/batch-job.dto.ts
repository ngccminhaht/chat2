/**
 * AI Batching Job Data Types
 */

export interface AISettings {
  batchDelayMs: number; // Default: 3000
  enabled: boolean;
  humanTakeoverMinutes: number; // Default: 30
  maxBatchSize: number; // Default: 10
  aiTimeoutMs: number; // Default: 30000
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  batchDelayMs: 3000,
  enabled: true,
  humanTakeoverMinutes: 30,
  maxBatchSize: 10,
  aiTimeoutMs: 30000,
};

export interface BatchJobData {
  conversationId: string;
  organizationId: string;
  messageIds: string[];
  createdAt: number;
}

export type AIState =
  | 'AI_ACTIVE'
  | 'BATCHING'
  | 'AI_RESPONDING'
  | 'HUMAN_TAKEOVER';
