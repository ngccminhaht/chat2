import { Platform, MessageType } from '@/common/constants';

/**
 * Parsed webhook event from platform
 */
export interface ParsedWebhookEvent {
  type: 'message' | 'status' | 'reaction' | 'comment' | 'postback' | 'unknown';
  platformAccountId: string;
  data: unknown;
}

/**
 * Normalized sender information
 */
export interface NormalizedSender {
  platformUserId: string;
  name: string;
  avatar?: string;
}

/**
 * Normalized message content
 */
export interface NormalizedMessageContent {
  type: MessageType;
  text?: string;
  media?: {
    url: string;
    type: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
  };
  sticker?: {
    stickerId: string;
    url?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  quickReply?: {
    payload: string;
  };
}

/**
 * Normalized incoming message from any platform
 */
export interface NormalizedIncomingMessage {
  platform: Platform;
  platformMessageId: string;
  platformConversationId: string;
  platformAccountId: string;
  sender: NormalizedSender;
  message: NormalizedMessageContent;
  timestamp: Date;
  rawPayload: unknown;
}

/**
 * Webhook handler interface - each platform must implement this
 */
export interface IWebhookHandler {
  /**
   * Verify webhook signature from platform
   * @param payload Raw webhook payload
   * @param signature Signature from request header
   * @param secret App secret or webhook secret
   */
  verifySignature(payload: unknown, signature: string, secret: string): boolean;

  /**
   * Parse raw webhook payload into events
   * @param payload Raw webhook payload from platform
   */
  parseWebhook(payload: unknown): ParsedWebhookEvent[];

  /**
   * Normalize a parsed event into standard message format
   * @param event Parsed webhook event
   */
  normalizeMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null;

  /**
   * Extract conversation key for this platform
   * @param event Parsed webhook event
   */
  extractConversationKey(event: ParsedWebhookEvent): string;

  /**
   * Extract platform account ID (page ID, OA ID, shop ID)
   * @param event Parsed webhook event
   */
  extractPlatformAccountId(event: ParsedWebhookEvent): string;

  /**
   * Check if this event should create/update a message
   * Some events (like read receipts) don't create messages
   */
  isMessageEvent(event: ParsedWebhookEvent): boolean;
}
