/**
 * Zalo OA Platform Adapter
 * Implements IPlatformAdapter for Zalo-specific logic
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

// Zalo error codes that indicate token expiration
const ZALO_TOKEN_EXPIRED_ERRORS = [-216, -124]; // -216: access token expired, -124: invalid access token
import {
  IPlatformAdapter,
  BasePlatformAdapter,
  PlatformEvent,
  MessageEvent,
  DeliveryEvent,
  ReadEvent,
  NormalizedMessage,
  OutboundMessage,
  PlatformPayload,
  SendResult,
  UserProfile,
} from '../core/interfaces';
import { ZaloWebhookDto, ZaloAttachment } from '../zalo/dto/zalo-webhook.dto';

@Injectable()
export class ZaloAdapter extends BasePlatformAdapter {
  readonly platform = Platform.ZALO;
  private readonly logger = new Logger(ZaloAdapter.name);
  private readonly appSecret: string;

  constructor(private readonly envService: EnvService) {
    super();
    this.appSecret = this.envService.get('ZALO_APP_SECRET');
  }

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature) {
      return false;
    }

    const hmac = createHmac('sha256', secret || this.appSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === signature;
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    const zaloPayload = payload as ZaloWebhookDto;
    // OA ID is in recipient.id
    return zaloPayload.recipient?.id || zaloPayload.app_id || 'unknown';
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const zaloPayload = payload as ZaloWebhookDto;
    const events: PlatformEvent[] = [];

    const eventName = zaloPayload.event_name;
    const senderId = zaloPayload.sender?.id;
    const recipientId = zaloPayload.recipient?.id;
    const timestamp = new Date(parseInt(zaloPayload.timestamp, 10));

    if (!senderId || !recipientId) {
      return events;
    }

    // Message events
    if (eventName?.startsWith('user_send_')) {
      const messageType = this.mapZaloEventToMessageType(eventName);
      const content = this.extractMessageContent(zaloPayload);

      events.push({
        type: 'message',
        senderId,
        recipientId,
        timestamp,
        messageId: zaloPayload.message?.msg_id || `zalo_${Date.now()}`,
        messageType,
        content,
        rawPayload: zaloPayload,
      } as MessageEvent);
    }

    // Delivery event
    if (eventName === 'user_received_message') {
      events.push({
        type: 'delivery',
        senderId,
        recipientId,
        timestamp,
        messageIds: zaloPayload.message?.msg_id ? [zaloPayload.message.msg_id] : [],
        rawPayload: zaloPayload,
      } as DeliveryEvent);
    }

    // Read event
    if (eventName === 'user_seen_message') {
      events.push({
        type: 'read',
        senderId,
        recipientId,
        timestamp,
        watermark: timestamp.getTime(),
        rawPayload: zaloPayload,
      } as ReadEvent);
    }

    return events;
  }

  private mapZaloEventToMessageType(eventName: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      'user_send_text': MessageType.TEXT,
      'user_send_image': MessageType.IMAGE,
      'user_send_video': MessageType.VIDEO,
      'user_send_audio': MessageType.AUDIO,
      'user_send_file': MessageType.FILE,
      'user_send_sticker': MessageType.STICKER,
      'user_send_location': MessageType.LOCATION,
      'user_send_gif': MessageType.IMAGE,
      'user_send_link': MessageType.TEXT,
    };
    return typeMap[eventName] || MessageType.UNKNOWN;
  }

  private extractMessageContent(payload: ZaloWebhookDto): MessageEvent['content'] {
    const content: MessageEvent['content'] = {};
    const message = payload.message;

    if (message?.text) {
      content.text = message.text;
    }

    if (message?.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0] as ZaloAttachment;
      content.mediaUrl = attachment.payload?.url;
      content.mediaType = attachment.type;
      content.thumbnailUrl = attachment.payload?.thumbnail;

      if (attachment.type === 'location' && attachment.payload?.coordinates) {
        content.location = {
          latitude: attachment.payload.coordinates.latitude,
          longitude: attachment.payload.coordinates.longitude,
        };
        content.text = `[Location: ${content.location.latitude}, ${content.location.longitude}]`;
      } else if (attachment.type === 'file') {
        content.fileName = attachment.payload?.name;
        content.fileSize = attachment.payload?.size;
        content.text = `[File: ${content.fileName || content.mediaUrl}]`;
      } else if (!content.text) {
        content.text = `[${attachment.type}: ${content.mediaUrl || ''}]`;
      }
    }

    return content;
  }

  // ==================== Message Normalization ====================

  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const conversationKey = this.getConversationKey(
      event.senderId,
      event.recipientId,
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
      },
    };
  }

  getConversationKey(senderId: string, recipientId: string): string {
    // Zalo: senderId_oaId
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    if (message.type === MessageType.TEXT && message.content.text) {
      return {
        message: {
          text: message.content.text,
        },
      };
    }

    if (message.content.mediaUrl) {
      return {
        message: {
          attachment: {
            type: this.mapMessageTypeToZalo(message.type),
            payload: {
              url: message.content.mediaUrl,
            },
          },
        },
      };
    }

    return {
      message: {
        text: message.content.text || '',
      },
    };
  }

  private mapMessageTypeToZalo(type: MessageType): string {
    const typeMap: Record<MessageType, string> = {
      [MessageType.TEXT]: 'text',
      [MessageType.IMAGE]: 'image',
      [MessageType.VIDEO]: 'video',
      [MessageType.AUDIO]: 'audio',
      [MessageType.FILE]: 'file',
      [MessageType.STICKER]: 'sticker',
      [MessageType.LOCATION]: 'template',
      [MessageType.TEMPLATE]: 'template',
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

      this.logger.log(`📤 Sending Zalo message to ${recipientId}`, {
        payload,
        hasAccessToken: !!accessToken,
      });

      const requestBody = {
        recipient: {
          user_id: recipientId,
        },
        ...payload,
      };

      this.logger.debug('Zalo API request:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
        },
      );

      this.logger.log(`📨 Zalo API response:`, response.data);

      if (response.data.error !== 0) {
        const errorCode = response.data.error;
        const errorMessage = response.data.message || `Zalo error: ${errorCode}`;

        // Check if token expired - return special error for retry with refresh
        if (ZALO_TOKEN_EXPIRED_ERRORS.includes(errorCode)) {
          this.logger.warn(`🔄 Zalo access token expired (error ${errorCode}), needs refresh`);
          return {
            success: false,
            error: errorMessage,
            needsTokenRefresh: true,
          };
        }

        this.logger.error(`❌ Zalo API error: ${errorCode} - ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }

      this.logger.log(`✅ Zalo message sent successfully: ${response.data.data?.message_id}`);
      return {
        success: true,
        platformMessageId: response.data.data?.message_id,
      };
    } catch (error) {
      this.logger.error('❌ Zalo send failed:', error.response?.data || error.message);
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
    try {
      const accessToken = connection.credentials.accessToken;

      const response = await axios.get(
        'https://openapi.zalo.me/v2.0/oa/getprofile',
        {
          headers: {
            access_token: accessToken,
          },
          params: {
            data: JSON.stringify({ user_id: userId }),
          },
        },
      );

      if (response.data.error !== 0) {
        return this.createDefaultProfile(userId, 'Zalo');
      }

      const userData = response.data.data;
      return {
        id: userId,
        name: userData.display_name || userData.user_alias || `Zalo User`,
        avatar: userData.avatars?.['120'] || userData.avatar,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch Zalo profile for ${userId}: ${error.message}`);
      return this.createDefaultProfile(userId, 'Zalo');
    }
  }
}
