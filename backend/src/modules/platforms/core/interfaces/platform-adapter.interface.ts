/**
 * Platform Adapter Interface
 * Defines the contract for all platform integrations
 */

import { Platform, MessageType, MessageDirection } from '@/common/constants';
import { PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';

// ============================================================================
// Platform Event Types
// ============================================================================

export type PlatformEventType = 'message' | 'delivery' | 'read' | 'postback' | 'comment' | 'follow' | 'unfollow';

export interface PlatformEvent {
  type: PlatformEventType;
  senderId: string;
  recipientId: string;
  timestamp: Date;
  messageId?: string;
  rawPayload: unknown;
}

export interface MessageEvent extends PlatformEvent {
  type: 'message';
  messageId: string;
  messageType: MessageType;
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface DeliveryEvent extends PlatformEvent {
  type: 'delivery';
  messageIds: string[];
  watermark?: number;
}

export interface ReadEvent extends PlatformEvent {
  type: 'read';
  watermark?: number;
}

export interface PostbackEvent extends PlatformEvent {
  type: 'postback';
  title: string;
  payload: string;
}

// ============================================================================
// Normalized Message (Internal Format)
// ============================================================================

export interface NormalizedMessage {
  platformMessageId: string;
  conversationKey: string; // Platform-specific conversation identifier
  direction: MessageDirection;
  type: MessageType;
  senderId: string;
  recipientId: string;
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
  timestamp: Date;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Outbound Message Types
// ============================================================================

export interface OutboundMessage {
  type: MessageType;
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
  };
}

export interface PlatformPayload {
  [key: string]: unknown;
}

export interface SendResult {
  success: boolean;
  platformMessageId?: string;
  error?: string;
  /** Set to true when token has expired and needs refresh before retry */
  needsTokenRefresh?: boolean;
}

// ============================================================================
// User Profile
// ============================================================================

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Platform Adapter Interface
// ============================================================================

export interface IPlatformAdapter {
  /**
   * Platform identifier
   */
  readonly platform: Platform;

  // ==================== Webhook Verification ====================

  /**
   * Verify webhook signature
   * @param rawBody - Raw request body string
   * @param signature - Signature from header
   * @param secret - App secret or partner key
   * @returns true if signature is valid
   */
  verifySignature(rawBody: string, signature: string, secret: string): boolean;

  // ==================== Webhook Parsing ====================

  /**
   * Extract platform account ID from webhook payload
   * - Facebook: entry[0].id (Page ID)
   * - Zalo: recipient.id (OA ID)
   * - Shopee: shop_id
   * - TikTok: shop_id
   */
  extractAccountId(payload: unknown): string;

  /**
   * Extract events from webhook payload
   * - Facebook: entry[].messaging[] (can have multiple events)
   * - Zalo: single event per webhook
   * - Shopee: single event per webhook
   */
  extractEvents(payload: unknown): PlatformEvent[];

  // ==================== Message Normalization ====================

  /**
   * Normalize platform message event to internal format
   * Called for 'message' type events only
   */
  normalizeMessage(event: MessageEvent): NormalizedMessage;

  /**
   * Get conversation key from sender and recipient IDs
   * - Facebook: `${senderId}_${pageId}`
   * - Zalo: `${senderId}_${oaId}`
   * - Shopee: conversation_id from payload
   */
  getConversationKey(senderId: string, recipientId: string, payload?: unknown): string;

  // ==================== Outbound Messages ====================

  /**
   * Format outbound message for platform API
   */
  formatOutbound(message: OutboundMessage): PlatformPayload;

  /**
   * Send message to platform
   * @param connection - Platform connection with credentials
   * @param recipientId - Customer platform user ID
   * @param payload - Formatted platform payload
   * @returns Send result with platform message ID
   */
  send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult>;

  // ==================== User Profile ====================

  /**
   * Fetch user profile from platform API
   * @param connection - Platform connection with credentials
   * @param userId - Platform user ID
   * @returns User profile or default if unavailable
   */
  fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string,
  ): Promise<UserProfile>;
}

// ============================================================================
// Abstract Base Adapter (Optional Helper)
// ============================================================================

export abstract class BasePlatformAdapter implements IPlatformAdapter {
  abstract readonly platform: Platform;

  abstract verifySignature(rawBody: string, signature: string, secret: string): boolean;
  abstract extractAccountId(payload: unknown): string;
  abstract extractEvents(payload: unknown): PlatformEvent[];
  abstract normalizeMessage(event: MessageEvent): NormalizedMessage;
  abstract getConversationKey(senderId: string, recipientId: string, payload?: unknown): string;
  abstract formatOutbound(message: OutboundMessage): PlatformPayload;
  abstract send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult>;
  abstract fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string,
  ): Promise<UserProfile>;

  /**
   * Helper: Map attachment type to MessageType
   */
  protected mapAttachmentType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      file: MessageType.FILE,
      sticker: MessageType.STICKER,
      location: MessageType.LOCATION,
      template: MessageType.TEMPLATE,
    };
    return typeMap[type.toLowerCase()] || MessageType.UNKNOWN;
  }

  /**
   * Helper: Create default user profile
   */
  protected createDefaultProfile(userId: string, platform: string): UserProfile {
    return {
      id: userId,
      name: `${platform} User ${userId.substring(0, 8)}`,
    };
  }
}
