/**
 * Kafka Message Types for Webhook Events
 */

import { Platform, MessageStatus, MessageType } from '@/common/constants';

/**
 * Raw webhook event published to platform.webhooks.raw
 */
export interface WebhookRawEvent {
  /** Unique event ID */
  eventId: string;

  /** Platform name */
  platform: Platform;

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
  platform: Platform;

  /** Platform message ID */
  platformMessageId: string;

  /** Platform conversation ID */
  platformConversationId: string;

  /** Message type */
  messageType: MessageType;

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
  platform: Platform;

  /** New status */
  status: MessageStatus;

  /** Status timestamp */
  timestamp: number;

  /** Error message if failed */
  error?: string;
}

/**
 * WebSocket notification published to websocket.notifications
 * Notifications are sent to user-specific rooms or org-wide rooms
 */
export interface WebSocketNotificationEvent {
  /** Notification type */
  type: 'message:new' | 'message:status' | 'conversation:updated' | 'message:read';

  /** User ID to send notification to (for user-specific events) */
  userId?: string;

  /** Organization ID to broadcast to all agents (for org-wide events) */
  organizationId?: string;

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

/**
 * Outgoing message event published to messages.outgoing
 */
export interface OutgoingMessageEvent {
  /** Internal message ID (MongoDB _id) */
  messageId: string;

  /** Conversation ID */
  conversationId: string;

  /** Platform name */
  platform: Platform;

  /** Platform connection ID */
  platformConnectionId: string;

  /** Platform account ID (Page ID, OA ID, etc.) */
  platformAccountId: string;

  /** Recipient platform user ID */
  recipientId: string;

  /** Message content */
  message: {
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
    stickerId?: string;
  };

  /** Platform credentials */
  credentials: {
    accessToken: string;
  };

  /** Event timestamp */
  timestamp: number;
}
