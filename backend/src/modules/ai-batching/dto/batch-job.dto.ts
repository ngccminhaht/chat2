/**
 * AI Batching Job Data Types
 */

export interface AISettings {
  batchDelayMs: number; // Default: 3000
  maxImages: number; // Default: 3
  enabled: boolean;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  batchDelayMs: 3000,
  maxImages: 3,
  enabled: true,
};

export interface BatchJobData {
  conversationId: string;
  organizationId: string;
  messageIds: string[];
  createdAt: number;
}

export type AIState = "AI_ACTIVE" | "BATCHING" | "AI_RESPONDING";
