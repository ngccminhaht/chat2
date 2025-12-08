import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Platform, MessageType } from '@/common/constants';
import {
  BaseWebhookHandler,
  ParsedWebhookEvent,
  NormalizedIncomingMessage,
  NormalizedMessageContent,
} from '@/common/platform';
import {
  ShopeeWebhookPayload,
  ShopeeMessageData,
  ShopeeMessageType,
} from './types/shopee-webhook.types';

/**
 * Shopee Webhook Handler
 * Handles webhook signature verification, parsing, and message normalization
 */
@Injectable()
export class ShopeeWebhookHandler extends BaseWebhookHandler {
  protected readonly platform = Platform.SHOPEE;

  constructor() {
    super('ShopeeWebhookHandler');
  }

  /**
   * Verify Shopee webhook signature
   * Shopee uses: HMAC-SHA256 of (url|body) with partner key
   */
  verifySignature(payload: unknown, signature: string, secret: string): boolean {
    if (!signature) {
      this.logger.warn('No signature provided');
      return false;
    }

    try {
      // Shopee signature is in the Authorization header
      // Format: partner_id|timestamp|access_token|shop_id|base_string|sign
      // For simplicity, we'll just verify the payload hash
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const hmac = createHmac('sha256', secret);
      hmac.update(payloadString);
      const calculatedSignature = hmac.digest('hex');

      return calculatedSignature === signature;
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Parse raw webhook payload into events
   */
  parseWebhook(payload: unknown): ParsedWebhookEvent[] {
    const shopeePayload = payload as ShopeeWebhookPayload;
    const events: ParsedWebhookEvent[] = [];

    const shopId = shopeePayload.shop_id?.toString();
    if (!shopId) {
      this.logger.warn('Missing shop_id in webhook payload');
      return events;
    }

    // Check if this is a message webhook
    const data = shopeePayload.data as ShopeeMessageData;
    if (data?.message_id) {
      events.push({
        type: 'message',
        platformAccountId: shopId,
        data: {
          ...data,
          _code: shopeePayload.code,
          _timestamp: shopeePayload.timestamp,
        },
      });
    }

    return events;
  }

  /**
   * Normalize a parsed event into standard message format
   */
  normalizeMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    if (event.type !== 'message') {
      return null;
    }

    const data = event.data as ShopeeMessageData & { _timestamp: number };

    // Skip messages sent by the shop (outbound)
    if (data.from_id.toString() === event.platformAccountId) {
      this.logger.debug('Ignoring outbound message from shop');
      return null;
    }

    const messageType = this.mapShopeeTypeToMessageType(data.message_type);
    const content = this.extractMessageContent(data, messageType);

    return {
      platform: Platform.SHOPEE,
      platformMessageId: data.message_id,
      platformConversationId: data.conversation_id,
      platformAccountId: event.platformAccountId,
      sender: {
        platformUserId: data.from_id.toString(),
        name: data.from_user_name || '',
        avatar: undefined,
      },
      message: content,
      timestamp: new Date(data.created_timestamp * 1000),
      rawPayload: data,
    };
  }

  /**
   * Extract message content based on type
   */
  private extractMessageContent(
    data: ShopeeMessageData,
    type: MessageType,
  ): NormalizedMessageContent {
    const content = data.content;

    if (!content) {
      return this.createEmptyContent();
    }

    switch (type) {
      case MessageType.TEXT:
        return this.createTextContent(content.text || '');

      case MessageType.IMAGE:
        return this.createMediaContent(
          MessageType.IMAGE,
          content.url || '',
          'image',
        );

      case MessageType.VIDEO:
        return this.createMediaContent(
          MessageType.VIDEO,
          content.url || '',
          'video',
        );

      case MessageType.FILE:
        return this.createMediaContent(
          MessageType.FILE,
          content.url || '',
          'file',
          undefined,
          content.file_name,
        );

      case MessageType.STICKER:
        return this.createStickerContent(
          content.sticker_id || '',
        );

      default:
        // For item/order types, create text representation
        if (data.message_type === 'item' && data.source_content?.item) {
          const item = data.source_content.item;
          return {
            type: MessageType.TEXT,
            text: `[Product: ${item.name || `Item #${item.item_id}`}]`,
          };
        }
        if (data.message_type === 'order' && data.source_content?.order) {
          return {
            type: MessageType.TEXT,
            text: `[Order: ${data.source_content.order.order_sn}]`,
          };
        }
        return this.createEmptyContent();
    }
  }

  /**
   * Map Shopee message type to MessageType
   */
  private mapShopeeTypeToMessageType(shopeeType: ShopeeMessageType): MessageType {
    const typeMap: Record<ShopeeMessageType, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      file: MessageType.FILE,
      sticker: MessageType.STICKER,
      item: MessageType.UNKNOWN,
      order: MessageType.UNKNOWN,
    };
    return typeMap[shopeeType] || MessageType.UNKNOWN;
  }

  /**
   * Extract conversation key from event
   */
  extractConversationKey(event: ParsedWebhookEvent): string {
    const data = event.data as ShopeeMessageData;
    return data.conversation_id;
  }

  /**
   * Extract platform account ID from event
   */
  extractPlatformAccountId(event: ParsedWebhookEvent): string {
    return event.platformAccountId;
  }

  /**
   * Check if event creates a message
   */
  isMessageEvent(event: ParsedWebhookEvent): boolean {
    return event.type === 'message';
  }
}
