/**
 * Kafka Message Types for Webhook Events
 */

/**
 * Raw webhook event published to platform.webhooks.raw
 */
export interface WebhookRawEvent {
  /** Unique event ID */
  eventId: string;

  /** Platform name (facebook, zalo, tiktok, shopee) */
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';

  /** Platform account ID (OA ID, Page ID, etc.) */
  platformAccountId: string;

  /** Platform connection ID (if found) */
  platformConnectionId?: string;

  /** Event type/name */
  eventName: string;

  /** Raw webhook payload from platform */
  payload: any;

  /** Webhook signature for verification */
  signature?: string;

  /** Event timestamp */
  timestamp: number;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Normalized incoming message published to messages.incoming
 */
export interface IncomingMessageEvent {
  /** Unique message ID */
  messageId: string;

  /** Conversation ID */
  conversationId: string;

  /** Platform connection ID */
  platformConnectionId: string;

  /** Platform name */
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';

  /** Platform message ID */
  platformMessageId: string;

  /** Platform conversation ID */
  platformConversationId: string;

  /** Message type */
  messageType: 'text' | 'image' | 'video' | 'file' | 'audio' | 'sticker' | 'location';

  /** Message content (normalized) */
  content: any;

  /** Sender information */
  sender: {
    platformUserId: string;
    name?: string;
    avatar?: string;
  };

  /** Message timestamp */
  timestamp: number;

  /** Original webhook payload */
  rawPayload?: any;
}

/**
 * Message status update published to messages.status
 */
export interface MessageStatusEvent {
  /** Platform message ID */
  platformMessageId: string;

  /** Platform name */
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';

  /** New status */
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

  /** Status timestamp */
  timestamp: number;

  /** Error message if failed */
  error?: string;
}

/**
 * WebSocket notification published to websocket.notifications
 */
export interface WebSocketNotificationEvent {
  /** Notification type */
  type: 'new_message' | 'message_status' | 'conversation_update' | 'typing';

  /** User ID to send notification to */
  userId?: string;

  /** Organization ID (for multi-user orgs) */
  organizationId?: string;

  /** Conversation ID (for room-based notifications) */
  conversationId?: string;

  /** Event payload */
  payload: any;

  /** Event timestamp */
  timestamp: number;
}
