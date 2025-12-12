/**
 * Shopee Platform Adapter
 * Implements IPlatformAdapter for Shopee-specific logic
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
import { ShopeeWebhookDto, ShopeeMessageType } from '../shopee/dto/shopee-webhook.dto';

@Injectable()
export class ShopeeAdapter extends BasePlatformAdapter {
  readonly platform = Platform.SHOPEE;
  private readonly logger = new Logger(ShopeeAdapter.name);
  private readonly partnerKey: string;
  private readonly apiHost: string;

  constructor(private readonly envService: EnvService) {
    super();
    const rawPartnerKey = this.envService.get('SHOPEE_PARTNER_KEY');
    this.partnerKey = rawPartnerKey?.startsWith('shpk') ? rawPartnerKey.substring(4) : rawPartnerKey;

    const isTestEnv = this.envService.get('SHOPEE_ENV') === 'test';
    this.apiHost = isTestEnv
      ? 'https://openplatform.sandbox.test-stable.shopee.sg'
      : 'https://partner.shopeemobile.com';
  }

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature) {
      return false;
    }

    // Shopee signature format: HMAC-SHA256(url + "|" + body, partner_key)
    // Note: URL is not available here, caller should include it in rawBody
    const hmac = createHmac('sha256', secret || this.partnerKey);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === signature;
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    const shopeePayload = payload as ShopeeWebhookDto;
    return shopeePayload.shop_id?.toString() || 'unknown';
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const shopeePayload = payload as ShopeeWebhookDto;
    const events: PlatformEvent[] = [];

    const data = shopeePayload.data;
    if (!data?.message_id) {
      return events;
    }

    const shopId = shopeePayload.shop_id?.toString();
    const customerId = data.from_id?.toString();
    const timestamp = data.created_timestamp
      ? new Date(data.created_timestamp * 1000)
      : new Date();

    if (!customerId || !shopId) {
      return events;
    }

    const messageType = this.mapShopeeMessageType(data.message_type);
    const content = this.extractMessageContent(data);

    events.push({
      type: 'message',
      senderId: customerId,
      recipientId: shopId,
      timestamp,
      messageId: data.message_id,
      messageType,
      content,
      rawPayload: shopeePayload,
    } as MessageEvent);

    return events;
  }

  private mapShopeeMessageType(type?: number): MessageType {
    const typeMap: Record<number, MessageType> = {
      [ShopeeMessageType.TEXT]: MessageType.TEXT,
      [ShopeeMessageType.IMAGE]: MessageType.IMAGE,
      [ShopeeMessageType.VIDEO]: MessageType.VIDEO,
      [ShopeeMessageType.FILE]: MessageType.FILE,
      [ShopeeMessageType.STICKER]: MessageType.STICKER,
      [ShopeeMessageType.ITEM]: MessageType.TEMPLATE,
      [ShopeeMessageType.ORDER]: MessageType.TEMPLATE,
    };
    return typeMap[type || 1] || MessageType.UNKNOWN;
  }

  private extractMessageContent(data: any): MessageEvent['content'] {
    const content: MessageEvent['content'] = {};

    if (data.content) {
      content.text = data.content;
    }

    // Handle different message types
    if (data.message_type === ShopeeMessageType.IMAGE) {
      content.mediaUrl = data.content;
      content.mediaType = 'image';
      content.text = `[Image: ${content.mediaUrl}]`;
    } else if (data.message_type === ShopeeMessageType.VIDEO) {
      content.mediaUrl = data.content;
      content.mediaType = 'video';
      content.text = `[Video: ${content.mediaUrl}]`;
    } else if (data.message_type === ShopeeMessageType.STICKER) {
      content.text = `[Sticker]`;
    } else if (data.message_type === ShopeeMessageType.ITEM) {
      content.text = `[Product Card]`;
    } else if (data.message_type === ShopeeMessageType.ORDER) {
      content.text = `[Order Card]`;
    }

    return content;
  }

  // ==================== Message Normalization ====================

  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const rawPayload = event.rawPayload as ShopeeWebhookDto;
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
        region: rawPayload.data?.region,
      },
    };
  }

  getConversationKey(senderId: string, recipientId: string, payload?: unknown): string {
    // Shopee provides conversation_id directly
    const shopeePayload = payload as ShopeeWebhookDto;
    if (shopeePayload?.data?.conversation_id) {
      return shopeePayload.data.conversation_id;
    }
    // Fallback: customerId_shopId
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: PlatformPayload = {};

    if (message.type === MessageType.TEXT && message.content.text) {
      payload.content = message.content.text;
      payload.message_type = 'text';
    } else if (message.content.mediaUrl) {
      payload.content = message.content.mediaUrl;
      payload.message_type = this.mapMessageTypeToShopee(message.type);
    }

    return payload;
  }

  private mapMessageTypeToShopee(type: MessageType): string {
    const typeMap: Record<MessageType, string> = {
      [MessageType.TEXT]: 'text',
      [MessageType.IMAGE]: 'image',
      [MessageType.VIDEO]: 'video',
      [MessageType.AUDIO]: 'file',
      [MessageType.FILE]: 'file',
      [MessageType.STICKER]: 'sticker',
      [MessageType.LOCATION]: 'text',
      [MessageType.TEMPLATE]: 'text',
      [MessageType.QUICK_REPLY]: 'text',
      [MessageType.UNKNOWN]: 'text',
    };
    return typeMap[type] || 'text';
  }

  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult> {
    try {
      const accessToken = connection.credentials.accessToken;
      const shopId = connection.platformAccountId;
      const timestamp = Math.floor(Date.now() / 1000);

      // Generate signature for Shopee API
      const path = '/api/v2/sellerchat/send_message';
      const baseString = `${connection.metadata?.partnerId}${path}${timestamp}${accessToken}${shopId}`;
      const sign = createHmac('sha256', this.partnerKey)
        .update(baseString)
        .digest('hex');

      const response = await axios.post(
        `${this.apiHost}${path}`,
        {
          to_id: parseInt(recipientId, 10),
          ...payload,
        },
        {
          params: {
            partner_id: connection.metadata?.partnerId,
            timestamp,
            access_token: accessToken,
            shop_id: shopId,
            sign,
          },
        },
      );

      if (response.data.error) {
        return {
          success: false,
          error: response.data.message || `Shopee error: ${response.data.error}`,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.response?.message_id,
      };
    } catch (error) {
      this.logger.error('Shopee send failed:', error.response?.data || error.message);
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
    // Shopee doesn't provide a user profile API for chat
    // Customer info comes from the webhook payload (from_name)
    const rawPayload = connection.metadata?.lastWebhookPayload as ShopeeWebhookDto;
    const customerName = rawPayload?.data?.from_name;

    return {
      id: userId,
      name: customerName || `Shopee Customer ${userId.substring(0, 8)}`,
    };
  }
}
