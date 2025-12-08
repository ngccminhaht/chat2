import { Platform, MessageType, MessageStatus } from '@/common/constants';
import { NormalizedIncomingMessage } from '../interfaces';

/**
 * Raw webhook payload published to Kafka
 */
export interface RawWebhookPayload {
  platform: Platform;
  platformAccountId: string;
  signature: string;
  timestamp: number;
  data: unknown;
}

/**
 * Outgoing message event for Kafka
 */
export interface OutgoingMessageEvent {
  messageId: string; // MongoDB ObjectId
  conversationId: string;
  platform: Platform;
  platformConnectionId: string;
  platformAccountId: string;
  recipientId: string;
  message: {
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
    stickerId?: string;
  };
  credentials: {
    accessToken: string;
  };
  timestamp: number;
}

/**
 * Message status update event
 */
export interface MessageStatusEvent {
  platform: Platform;
  platformMessageId: string;
  messageId?: string; // MongoDB ObjectId if known
  status: MessageStatus;
  error?: string;
  timestamp: number;
}

/**
 * WebSocket notification event types
 */
export type WebSocketNotificationType =
  | 'message:new'
  | 'message:status'
  | 'conversation:new'
  | 'conversation:updated'
  | 'typing:start'
  | 'typing:stop'
  | 'connection:status';

/**
 * WebSocket notification payload
 */
export interface WebSocketNotificationEvent {
  type: WebSocketNotificationType;
  userId: string;
  payload: unknown;
  timestamp: number;
}

/**
 * New message WebSocket payload
 */
export interface NewMessagePayload {
  conversationId: string;
  message: {
    id: string;
    platformMessageId: string;
    type: MessageType;
    content: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
    };
    sender: {
      platformUserId: string;
      name: string;
      avatar?: string;
    };
    createdAt: Date;
  };
}

/**
 * Conversation updated WebSocket payload
 */
export interface ConversationUpdatedPayload {
  conversationId: string;
  lastMessage?: {
    text: string;
    timestamp: Date;
    senderId: string;
  };
  unreadCount?: number;
}
