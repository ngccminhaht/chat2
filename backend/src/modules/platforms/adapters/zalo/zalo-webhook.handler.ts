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
  ZaloWebhookPayload,
  ZaloMessage,
  ZaloEventName,
} from './types/zalo-webhook.types';

/**
 * Zalo Webhook Handler
 * Handles webhook signature verification, parsing, and message normalization
 */
@Injectable()
export class ZaloWebhookHandler extends BaseWebhookHandler {
  protected readonly platform = Platform.ZALO;

  constructor() {
    super('ZaloWebhookHandler');
  }

  /**
   * Verify Zalo webhook signature
   * Zalo uses: HMAC-SHA256 of JSON payload with app secret
   */
  verifySignature(payload: unknown, signature: string, secret: string): boolean {
    if (!signature) {
      this.logger.warn('No signature provided');
      return false;
    }

    try {
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
   * Zalo sends one event per webhook call
   */
  parseWebhook(payload: unknown): ParsedWebhookEvent[] {
    const zaloPayload = payload as ZaloWebhookPayload;
    const events: ParsedWebhookEvent[] = [];

    const oaId = zaloPayload.recipient?.id || zaloPayload.oa_id;
    if (!oaId) {
      this.logger.warn('Missing OA ID in webhook payload');
      return events;
    }

    // Determine event type from event_name
    let eventType: ParsedWebhookEvent['type'] = 'unknown';

    if (this.isZaloMessageEvent(zaloPayload.event_name)) {
      eventType = 'message';
    } else if (zaloPayload.event_name === 'user_received_message') {
      eventType = 'status'; // Delivery status
    } else if (zaloPayload.event_name === 'user_seen_message') {
      eventType = 'status'; // Read status
    } else if (zaloPayload.event_name === 'follow' || zaloPayload.event_name === 'unfollow') {
      eventType = 'unknown'; // Follow events, not message
    }

    events.push({
      type: eventType,
      platformAccountId: oaId,
      data: zaloPayload,
    });

    return events;
  }

  /**
   * Normalize a parsed event into standard message format
   */
  normalizeMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    if (event.type !== 'message') {
      return null;
    }

    const payload = event.data as ZaloWebhookPayload;
    const senderId = payload.sender?.id;
    const oaId = payload.recipient?.id;

    if (!senderId || !oaId) {
      this.logger.warn('Missing sender or recipient ID');
      return null;
    }

    const messageType = this.mapEventToMessageType(payload.event_name);
    const content = this.extractMessageContent(payload.message, messageType);

    return {
      platform: Platform.ZALO,
      platformMessageId: payload.message?.msg_id || this.generateMessageId(),
      platformConversationId: `${senderId}_${oaId}`,
      platformAccountId: oaId,
      sender: {
        platformUserId: senderId,
        name: '', // Will be fetched later by processor
        avatar: undefined,
      },
      message: content,
      timestamp: new Date(parseInt(payload.timestamp)),
      rawPayload: payload,
    };
  }

  /**
   * Extract message content based on type
   */
  private extractMessageContent(
    message: ZaloMessage | undefined,
    type: MessageType,
  ): NormalizedMessageContent {
    if (!message) {
      return this.createEmptyContent();
    }

    switch (type) {
      case MessageType.TEXT:
        return this.createTextContent(message.text || '');

      case MessageType.IMAGE:
        return this.createMediaContent(
          MessageType.IMAGE,
          message.url || message.attachments?.[0]?.payload?.url || '',
          'image',
          message.thumb || message.attachments?.[0]?.payload?.thumbnail,
        );

      case MessageType.VIDEO:
        return this.createMediaContent(
          MessageType.VIDEO,
          message.url || message.attachments?.[0]?.payload?.url || '',
          'video',
          message.thumb,
        );

      case MessageType.AUDIO:
        return this.createMediaContent(
          MessageType.AUDIO,
          message.url || message.attachments?.[0]?.payload?.url || '',
          'audio',
        );

      case MessageType.FILE:
        const fileAttachment = message.attachments?.[0]?.payload;
        return this.createMediaContent(
          MessageType.FILE,
          message.url || fileAttachment?.url || '',
          'file',
          undefined,
          fileAttachment?.name,
          fileAttachment?.size,
        );

      case MessageType.STICKER:
        return this.createStickerContent(
          message.sticker_id || '',
          message.url,
        );

      case MessageType.LOCATION:
        if (message.coordinates) {
          return this.createLocationContent(
            message.coordinates.latitude,
            message.coordinates.longitude,
          );
        }
        return this.createEmptyContent();

      default:
        return this.createEmptyContent();
    }
  }

  /**
   * Map Zalo event name to MessageType
   */
  private mapEventToMessageType(eventName: ZaloEventName): MessageType {
    const eventMap: Record<string, MessageType> = {
      user_send_text: MessageType.TEXT,
      user_send_image: MessageType.IMAGE,
      user_send_video: MessageType.VIDEO,
      user_send_file: MessageType.FILE,
      user_send_audio: MessageType.AUDIO,
      user_send_sticker: MessageType.STICKER,
      user_send_location: MessageType.LOCATION,
      user_send_gif: MessageType.IMAGE, // GIF treated as IMAGE
    };
    return eventMap[eventName] || MessageType.UNKNOWN;
  }

  /**
   * Check if Zalo event name is a message event
   */
  private isZaloMessageEvent(eventName: ZaloEventName): boolean {
    return eventName.startsWith('user_send_');
  }

  /**
   * Extract conversation key from event
   */
  extractConversationKey(event: ParsedWebhookEvent): string {
    const payload = event.data as ZaloWebhookPayload;
    const senderId = payload.sender?.id || '';
    const oaId = payload.recipient?.id || '';
    return `${senderId}_${oaId}`;
  }

  /**
   * Extract platform account ID from event
   */
  extractPlatformAccountId(event: ParsedWebhookEvent): string {
    return event.platformAccountId;
  }

  /**
   * Check if parsed event is a message event
   */
  isMessageEvent(event: ParsedWebhookEvent): boolean {
    return event.type === 'message';
  }
}
