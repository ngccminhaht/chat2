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
 * All notifications are sent to user-specific rooms based on userId
 */
export interface WebSocketNotificationEvent {
  /** Notification type */
  type: 'message:new' | 'message:status' | 'conversation:updated' | 'message:read' | 'typing:indicator';

  /** User ID to send notification to (REQUIRED - for partitioning by userId) */
  userId: string;

  /** Event payload */
  payload: any;

  /** Event timestamp */
  timestamp: number;
}

/**
 * New message notification payload
 */
export interface NewMessagePayload {
  _id: string;
  conversationId: string;
  platform: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: any;
  sender: {
    platformUserId: string;
    name?: string;
    avatar?: string;
  };
  status: string;
  createdAt: Date;
}

/**
 * Message status update payload
 */
export interface MessageStatusPayload {
  conversationId: string;
  messageId: string;
  status: string;
}

/**
 * Conversation updated payload
 */
export interface ConversationUpdatedPayload {
  _id: string;
  platform?: string;
  platformConversationId?: string;
  unreadCount?: number;
  lastMessage?: any;
  [key: string]: any;
}

/**
 * Messages read payload
 */
export interface MessagesReadPayload {
  conversationId: string;
  messageIds: string[];
}
