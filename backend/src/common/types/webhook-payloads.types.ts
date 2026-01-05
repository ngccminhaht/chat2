/**
 * Platform Webhook Payload Types
 * Type-safe definitions for incoming webhook payloads
 */

import { MessageType, MessageDirection } from '../constants';

// ============================================================================
// Facebook Webhook Types
// ============================================================================

export interface FacebookWebhookEntry {
  id: string;
  time: number;
  messaging?: FacebookMessagingEvent[];
}

export interface FacebookMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: FacebookMessage;
  delivery?: FacebookDelivery;
  read?: FacebookRead;
}

export interface FacebookMessage {
  mid: string;
  text?: string;
  attachments?: FacebookAttachment[];
  quick_reply?: {
    payload: string;
  };
}

export interface FacebookAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  payload: {
    url?: string;
    sticker_id?: number;
  };
}

export interface FacebookDelivery {
  mids: string[];
  watermark: number;
}

export interface FacebookRead {
  watermark: number;
}

export interface FacebookWebhookPayload {
  object: 'page';
  entry: FacebookWebhookEntry[];
}

// ============================================================================
// Zalo Webhook Types
// ============================================================================

export interface ZaloWebhookPayload {
  app_id: string;
  user_id_by_app: string;
  oa_id: string;
  timestamp: string;
  event_name: 'user_send_text' | 'user_send_image' | 'user_send_link' | 'user_send_sticker' | 'user_send_audio' | 'user_send_video' | 'user_send_file' | 'user_send_location' | 'user_send_gif';
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  message: ZaloMessage;
}

export interface ZaloMessage {
  text?: string;
  msg_id: string;
  attachments?: ZaloAttachment[];
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface ZaloAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'gif';
  payload: {
    url?: string;
    id?: string;
    thumbnail?: string;
  };
}

// ============================================================================
// Shopee Webhook Types
// ============================================================================

export enum ShopeeMessageType {
  TEXT = 1,
  IMAGE = 2,
  ITEM_CARD = 3,
  ORDER_CARD = 4,
  STICKER = 5,
  LINK = 6,
  VIDEO = 7,
}

export interface ShopeeWebhookPayload {
  code: number;
  data: {
    conversation_id: string;
    message_id: string;
    to_id: number;
    from_id: number;
    message_type: ShopeeMessageType;
    content: string;
    region: string;
    shop_id: number;
    status: number;
    source: number;
    created_timestamp: number;
  };
}

// ============================================================================
// Generic Normalized Message (Internal Format)
// ============================================================================

export interface NormalizedMessage {
  conversationId: string;
  platformMessageId: string;
  direction: MessageDirection;
  type: MessageType;
  senderId: string;
  content: {
    text?: string;
    attachments?: Array<{
      type: MessageType;
      url: string;
      thumbnail?: string;
    }>;
  };
  metadata: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// Webhook Processing Result
// ============================================================================

export interface WebhookProcessingResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  error?: string;
}
