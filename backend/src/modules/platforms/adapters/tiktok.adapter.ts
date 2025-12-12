/**
 * TikTok Shop Platform Adapter
 * Implements IPlatformAdapter for TikTok Shop-specific logic
 *
 * TikTok Shop Customer Service API:
 * - Webhook: Real-time message notifications
 * - Send Message: POST /customer_service/202309/conversations/{conversation_id}/messages
 * - Get Conversations: GET /customer_service/202309/conversations
 * - Get Messages: GET /customer_service/202309/conversations/{conversation_id}/messages
 *
 * @see https://partner.tiktokshop.com/docv2/page/659645f9a46cdd02bc8aeacf
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import {
  Platform,
  MessageType,
  MessageDirection,
} from '@/common/constants';
import { EnvService } from '@/common/env';
import { PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';
import {
  IPlatformAdapter,
  BasePlatformAdapter,
  PlatformEvent,
  MessageEvent,
  NormalizedMessage,
  OutboundMessage,
  PlatformPayload,
  SendResult,
  UserProfile,
} from '../core/interfaces';

// TikTok Shop Webhook Payload Types
export interface TikTokWebhookDto {
  type: number; // Event type: 1 = new message
  shop_id: string;
  timestamp: number;
  data: {
    conversation_id: string;
    message_id: string;
    message_type: TikTokMessageType;
    content: {
      text?: string;
      image_info?: {
        image_url: string;
        width: number;
        height: number;
      };
      video_info?: {
        video_url: string;
        cover_url: string;
        duration: number;
      };
      product_info?: {
        product_id: string;
        product_name: string;
      };
      order_info?: {
        order_id: string;
        order_status: string;
      };
    };
    sender: {
      id: string;
      name: string;
      avatar_url?: string;
    };
    create_time: number;
  };
}

export enum TikTokMessageType {
  TEXT = 1,
  IMAGE = 2,
  VIDEO = 3,
  PRODUCT_CARD = 4,
  ORDER_CARD = 5,
}

@Injectable()
export class TikTokAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TIKTOK;
  private readonly logger = new Logger(TikTokAdapter.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly apiHost = 'https://open-api.tiktokglobalshop.com';

  constructor(private readonly envService: EnvService) {
    super();
    this.appId = this.envService.get('TIKTOK_APP_ID') || '';
    this.appSecret = this.envService.get('TIKTOK_APP_SECRET') || '';
  }

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature) {
      return false;
    }

    // TikTok signature: HMAC-SHA256 of request body
    const hmac = createHmac('sha256', secret || this.appSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === signature;
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    const tiktokPayload = payload as TikTokWebhookDto;
    return tiktokPayload.shop_id || 'unknown';
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const tiktokPayload = payload as TikTokWebhookDto;
    const events: PlatformEvent[] = [];

    // Only process message events (type = 1)
    if (tiktokPayload.type !== 1) {
      return events;
    }

    const data = tiktokPayload.data;
    if (!data?.message_id) {
      return events;
    }

    const shopId = tiktokPayload.shop_id;
    const sender = data.sender;
    const timestamp = new Date(data.create_time * 1000);

    const messageType = this.mapTikTokMessageType(data.message_type);
    const content = this.extractMessageContent(data);

    events.push({
      type: 'message',
      senderId: sender.id,
      recipientId: shopId,
      timestamp,
      messageId: data.message_id,
      messageType,
      content,
      rawPayload: tiktokPayload,
    } as MessageEvent);

    return events;
  }

  private mapTikTokMessageType(type: TikTokMessageType): MessageType {
    const typeMap: Record<TikTokMessageType, MessageType> = {
      [TikTokMessageType.TEXT]: MessageType.TEXT,
      [TikTokMessageType.IMAGE]: MessageType.IMAGE,
      [TikTokMessageType.VIDEO]: MessageType.VIDEO,
      [TikTokMessageType.PRODUCT_CARD]: MessageType.TEMPLATE,
      [TikTokMessageType.ORDER_CARD]: MessageType.TEMPLATE,
    };
    return typeMap[type] || MessageType.UNKNOWN;
  }

  private extractMessageContent(data: TikTokWebhookDto['data']): MessageEvent['content'] {
    const content: MessageEvent['content'] = {};

    switch (data.message_type) {
      case TikTokMessageType.TEXT:
        content.text = data.content.text;
        break;

      case TikTokMessageType.IMAGE:
        content.mediaUrl = data.content.image_info?.image_url;
        content.mediaType = 'image';
        content.text = `[Image: ${content.mediaUrl}]`;
        break;

      case TikTokMessageType.VIDEO:
        content.mediaUrl = data.content.video_info?.video_url;
        content.thumbnailUrl = data.content.video_info?.cover_url;
        content.mediaType = 'video';
        content.text = `[Video]`;
        break;

      case TikTokMessageType.PRODUCT_CARD:
        content.text = `[Product: ${data.content.product_info?.product_name || 'Unknown'}]`;
        break;

      case TikTokMessageType.ORDER_CARD:
        content.text = `[Order: ${data.content.order_info?.order_id || 'Unknown'}]`;
        break;

      default:
        content.text = '[Unknown message type]';
    }

    return content;
  }

  // ==================== Message Normalization ====================

  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const rawPayload = event.rawPayload as TikTokWebhookDto;
    const conversationKey = this.getConversationKey(
      event.senderId,
      event.recipientId,
      rawPayload,
    );

    return {
      platformMessageId: event.messageId,
      conversationKey,
      direction: MessageDirection.INBOUND,
      type: event.messageType,
      senderId: event.senderId,
      recipientId: event.recipientId,
      content: event.content,
      timestamp: event.timestamp,
      metadata: {
        rawPayload: event.rawPayload,
        senderName: rawPayload.data?.sender?.name,
        senderAvatar: rawPayload.data?.sender?.avatar_url,
      },
    };
  }

  getConversationKey(senderId: string, recipientId: string, payload?: unknown): string {
    // TikTok provides conversation_id directly
    const tiktokPayload = payload as TikTokWebhookDto;
    if (tiktokPayload?.data?.conversation_id) {
      return tiktokPayload.data.conversation_id;
    }
    // Fallback
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: PlatformPayload = {};

    if (message.type === MessageType.TEXT && message.content.text) {
      payload.message_type = TikTokMessageType.TEXT;
      payload.content = {
        text: message.content.text,
      };
    } else if (message.content.mediaUrl) {
      if (message.type === MessageType.IMAGE) {
        payload.message_type = TikTokMessageType.IMAGE;
        payload.content = {
          image_info: {
            image_url: message.content.mediaUrl,
          },
        };
      } else if (message.type === MessageType.VIDEO) {
        payload.message_type = TikTokMessageType.VIDEO;
        payload.content = {
          video_info: {
            video_url: message.content.mediaUrl,
          },
        };
      }
    }

    return payload;
  }

  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult> {
    try {
      const accessToken = connection.credentials.accessToken;
      const shopCipher = connection.metadata?.shopCipher;
      const conversationId = connection.metadata?.conversationId;

      if (!conversationId) {
        return {
          success: false,
          error: 'Conversation ID not available',
        };
      }

      // TikTok API requires timestamp and signature
      const timestamp = Math.floor(Date.now() / 1000);
      const path = `/customer_service/202309/conversations/${conversationId}/messages`;

      // Generate signature
      const signatureBase = `${this.appSecret}${path}${timestamp}`;
      const sign = createHmac('sha256', this.appSecret)
        .update(signatureBase)
        .digest('hex');

      const response = await axios.post(
        `${this.apiHost}${path}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tts-access-token': accessToken,
          },
          params: {
            app_key: this.appId,
            timestamp,
            sign,
            shop_cipher: shopCipher,
          },
        },
      );

      if (response.data.code !== 0) {
        return {
          success: false,
          error: response.data.message || `TikTok error: ${response.data.code}`,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.data?.message_id,
      };
    } catch (error) {
      this.logger.error('TikTok send failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==================== User Profile ====================

  async fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string,
  ): Promise<UserProfile> {
    // TikTok provides user info in webhook payload
    // Extract from metadata if available
    const lastPayload = connection.metadata?.lastWebhookPayload as TikTokWebhookDto;
    const sender = lastPayload?.data?.sender;

    if (sender && sender.id === userId) {
      return {
        id: userId,
        name: sender.name || `TikTok User`,
        avatar: sender.avatar_url,
      };
    }

    return this.createDefaultProfile(userId, 'TikTok');
  }
}
