/**
 * Facebook Messenger Platform Adapter
 * Implements IPlatformAdapter for Facebook-specific logic
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
  DeliveryEvent,
  ReadEvent,
  PostbackEvent,
  NormalizedMessage,
  OutboundMessage,
  PlatformPayload,
  SendResult,
  UserProfile,
} from '../core/interfaces';
import {
  FacebookWebhookDto,
  FacebookMessagingEvent,
  FacebookAttachment,
} from '../facebook/dto/facebook-webhook.dto';

@Injectable()
export class FacebookAdapter extends BasePlatformAdapter {
  readonly platform = Platform.FACEBOOK;
  private readonly logger = new Logger(FacebookAdapter.name);
  private readonly graphApiVersion = 'v19.0';
  private readonly appSecret: string;

  constructor(private readonly envService: EnvService) {
    super();
    this.appSecret = this.envService.get('FACEBOOK_APP_SECRET');
  }

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature) {
      return false;
    }

    // Facebook signature format: sha256=<hash>
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return false;
    }

    const hmac = createHmac('sha256', secret || this.appSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === parts[1];
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    const fbPayload = payload as FacebookWebhookDto;
    return fbPayload.entry?.[0]?.id || 'unknown';
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const fbPayload = payload as FacebookWebhookDto;
    const events: PlatformEvent[] = [];

    if (fbPayload.object !== 'page') {
      return events;
    }

    for (const entry of fbPayload.entry || []) {
      const pageId = entry.id;
      const timestamp = new Date(entry.time);

      // Process messaging events
      for (const messaging of entry.messaging || []) {
        const event = this.parseMessagingEvent(messaging, pageId, timestamp);
        if (event) {
          events.push(event);
        }
      }

      // Process feed/comments events
      for (const change of entry.changes || []) {
        if (change.field === 'comments' || change.field === 'feed') {
          const event = this.parseCommentEvent(change.value, pageId, timestamp);
          if (event) {
            events.push(event);
          }
        }
      }
    }

    return events;
  }

  private parseMessagingEvent(
    messaging: FacebookMessagingEvent,
    pageId: string,
    timestamp: Date,
  ): PlatformEvent | null {
    const senderId = messaging.sender.id;
    const recipientId = messaging.recipient.id;
    const eventTimestamp = new Date(messaging.timestamp);

    if (messaging.message) {
      // Skip echo messages
      if (messaging.message.is_echo) {
        return null;
      }

      const messageType = this.determineMessageType(messaging.message);
      const content = this.extractMessageContent(messaging.message);

      return {
        type: 'message',
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageId: messaging.message.mid,
        messageType,
        content,
        rawPayload: messaging,
      } as MessageEvent;
    }

    if (messaging.delivery) {
      return {
        type: 'delivery',
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageIds: messaging.delivery.mids || [],
        watermark: messaging.delivery.watermark,
        rawPayload: messaging,
      } as DeliveryEvent;
    }

    if (messaging.read) {
      return {
        type: 'read',
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        watermark: messaging.read.watermark,
        rawPayload: messaging,
      } as ReadEvent;
    }

    if (messaging.postback) {
      return {
        type: 'postback',
        senderId,
        recipientId,
        timestamp: eventTimestamp,
        messageId: `postback_${senderId}_${eventTimestamp.getTime()}`,
        messageType: MessageType.TEXT,
        title: messaging.postback.title,
        payload: messaging.postback.payload,
        content: {
          text: `[Postback: ${messaging.postback.title}]`,
        },
        rawPayload: messaging,
      } as PostbackEvent & MessageEvent;
    }

    return null;
  }

  private parseCommentEvent(
    value: any,
    pageId: string,
    timestamp: Date,
  ): PlatformEvent | null {
    // Only handle new comments
    if (value.verb !== 'add' && value.verb !== undefined) {
      return null;
    }

    const commenterId = value.sender_id;
    const commentId = value.comment_id;
    const postId = value.post_id;

    if (!commenterId || !postId) {
      return null;
    }

    // Return as PlatformEvent with message-like properties for unified processing
    return {
      type: 'message',  // Treat comments as messages for unified processing
      senderId: commenterId,
      recipientId: pageId,
      timestamp,
      messageId: commentId || `comment_${commenterId}_${timestamp.getTime()}`,
      messageType: MessageType.TEXT,
      content: {
        text: value.message || '[Comment]',
      },
      rawPayload: { ...value, postId, isComment: true },
    } as MessageEvent;
  }

  private determineMessageType(message: any): MessageType {
    if (message.attachments && message.attachments.length > 0) {
      return this.mapAttachmentType(message.attachments[0].type);
    }
    if (message.sticker) {
      return MessageType.STICKER;
    }
    return MessageType.TEXT;
  }

  private extractMessageContent(message: any): MessageEvent['content'] {
    const content: MessageEvent['content'] = {};

    if (message.text) {
      content.text = message.text;
    }

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0] as FacebookAttachment;
      content.mediaUrl = attachment.payload?.url;
      content.mediaType = attachment.type;

      if (attachment.type === 'location' && attachment.payload?.coordinates) {
        content.location = {
          latitude: attachment.payload.coordinates.lat,
          longitude: attachment.payload.coordinates.long,
        };
        content.text = `[Location: ${content.location.latitude}, ${content.location.longitude}]`;
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
      event.rawPayload,
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

  getConversationKey(senderId: string, recipientId: string, payload?: unknown): string {
    // For comments, use post-based conversation key
    if (payload && (payload as any).postId) {
      return `post_${(payload as any).postId}_${recipientId}`;
    }
    // For direct messages: senderId_pageId
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: PlatformPayload = {};

    if (message.type === MessageType.TEXT && message.content.text) {
      payload.message = {
        text: message.content.text,
      };
    } else if (message.content.mediaUrl) {
      payload.message = {
        attachment: {
          type: this.mapMessageTypeToFacebook(message.type),
          payload: {
            url: message.content.mediaUrl,
            is_reusable: true,
          },
        },
      };
    }

    return payload;
  }

  private mapMessageTypeToFacebook(type: MessageType): string {
    const typeMap: Record<MessageType, string> = {
      [MessageType.TEXT]: 'text',
      [MessageType.IMAGE]: 'image',
      [MessageType.VIDEO]: 'video',
      [MessageType.AUDIO]: 'audio',
      [MessageType.FILE]: 'file',
      [MessageType.STICKER]: 'image',
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

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          ...payload,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error.message,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.message_id,
      };
    } catch (error) {
      this.logger.error('Facebook send failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
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
        `https://graph.facebook.com/${this.graphApiVersion}/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,profile_pic',
          },
        },
      );

      if (response.data.error) {
        return this.createDefaultProfile(userId, 'Facebook');
      }

      return {
        id: response.data.id,
        name: response.data.name,
        avatar: response.data.profile_pic,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch Facebook profile for ${userId}: ${error.message}`);
      return this.createDefaultProfile(userId, 'Facebook');
    }
  }
}
