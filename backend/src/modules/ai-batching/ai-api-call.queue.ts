/**
 * AI API Call Queue
 * BullMQ queue for handling AI API calls with built-in retry
 */

export const AI_API_CALL_QUEUE = "ai-api-call";

export interface AIAPICallJobData {
  conversationId: string;
  organizationId: string;
  messageIds: string[];
  customerId?: string;
  // Tracking
  attempt?: number;
  firstAttemptAt?: number;
}

export interface AIAPICallResult {
  success: boolean;
  answer?: string;
  messageId?: string;
  aiConversationId?: string;
  error?: {
    type: string;
    message: string;
    statusCode?: number;
  };
}
