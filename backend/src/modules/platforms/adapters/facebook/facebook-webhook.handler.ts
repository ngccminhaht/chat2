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
  FacebookWebhookPayload,
  FacebookMessagingEvent,
  FacebookMessage,
  FacebookChange,
  FacebookChangeValue,
  FacebookAttachment,
} from './types/facebook-webhook.types';

/**
 * Facebook Webhook Handler
 * Handles webhook signature verification, parsing, and message normalization
 */
@Injectable()
export class FacebookWebhookHandler extends BaseWebhookHandler {
  protected readonly platform = Platform.FACEBOOK;

  constructor() {
    super('FacebookWebhookHandler');
  }

  /**
   * Verify Facebook webhook signature
   * Facebook uses: x-hub-signature-256: sha256=<hash>
   * Hash is HMAC-SHA256 of raw request body using app secret
   */
  verifySignature(payload: unknown, signature: string, secret: string): boolean {
    if (!signature) {
      this.logger.warn('No signature provided');
      return false;
    }

    // Signature format: sha256=<hash>
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      this.logger.warn('Invalid signature format');
      return false;
    }

    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const hmac = createHmac('sha256', secret);
      hmac.update(payloadString);
      const calculatedSignature = hmac.digest('hex');

      return calculatedSignature === parts[1];
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Parse raw webhook payload into events
   */
  parseWebhook(payload: unknown): ParsedWebhookEvent[] {
    const fbPayload = payload as FacebookWebhookPayload;
    const events: ParsedWebhookEvent[] = [];

    if (fbPayload.object !== 'page') {
      this.logger.debug(`Skipping webhook for object: ${fbPayload.object}`);
      return events;
    }

    for (const entry of fbPayload.entry) {
      const platformAccountId = entry.id; // Page ID

      // Process messaging events (direct messages)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          // Determine event type
          let eventType: ParsedWebhookEvent['type'] = 'unknown';

          if (event.message) {
            eventType = 'message';
          } else if (event.delivery) {
            eventType = 'status';
          } else if (event.read) {
            eventType = 'status';
          } else if (event.postback) {
            eventType = 'postback';
          }

          events.push({
            type: eventType,
            platformAccountId,
            data: {
              ...event,
              _entryTime: entry.time,
              _eventSource: 'messaging',
            },
          });
        }
      }

      // Process feed events (comments)
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'feed' || change.field === 'comments') {
            events.push({
              type: 'comment',
              platformAccountId,
              data: {
                change,
                _entryTime: entry.time,
                _eventSource: 'changes',
              },
            });
          }
        }
      }
    }

    return events;
  }

  /**
   * Normalize a parsed event into standard message format
   */
  normalizeMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    if (event.type === 'message') {
      return this.normalizeMessengerMessage(event);
    }

    if (event.type === 'comment') {
      return this.normalizeCommentMessage(event);
    }

    if (event.type === 'postback') {
      return this.normalizePostbackMessage(event);
    }

    // Status events (delivery, read) don't create messages
    return null;
  }

  /**
   * Normalize Messenger direct message
   */
  private normalizeMessengerMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    const data = event.data as FacebookMessagingEvent & { _entryTime: number };
    const message = data.message;

    if (!message) return null;

    // Ignore echo messages (sent by the page itself)
    if (message.is_echo) {
      this.logger.debug('Ignoring echo message');
      return null;
    }

    const senderId = data.sender.id;
    const pageId = data.recipient.id;

    return {
      platform: Platform.FACEBOOK,
      platformMessageId: message.mid,
      platformConversationId: `${senderId}_${pageId}`,
      platformAccountId: event.platformAccountId,
      sender: {
        platformUserId: senderId,
        name: '', // Will be fetched later by processor
        avatar: undefined,
      },
      message: this.extractMessageContent(message),
      timestamp: new Date(data.timestamp),
      rawPayload: data,
    };
  }

  /**
   * Normalize comment message from feed
   */
  private normalizeCommentMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    const data = event.data as { change: FacebookChange; _entryTime: number };
    const changeValue = data.change.value;

    // Only handle comment additions
    if (changeValue.verb !== 'add' && changeValue.verb !== undefined) {
      this.logger.debug(`Skipping comment event with verb: ${changeValue.verb}`);
      return null;
    }

    const commenterId = changeValue.sender_id;
    const postId = changeValue.post_id;
    const commentId = changeValue.comment_id;

    if (!commenterId || !postId) {
      this.logger.warn('Comment missing required fields');
      return null;
    }

    return {
      platform: Platform.FACEBOOK,
      platformMessageId: commentId || `comment_${commenterId}_${data._entryTime}`,
      platformConversationId: `post_${postId}_${event.platformAccountId}`,
      platformAccountId: event.platformAccountId,
      sender: {
        platformUserId: commenterId,
        name: changeValue.sender_name || '',
        avatar: undefined,
      },
      message: {
        type: MessageType.TEXT, // Comments are always text
        text: changeValue.message || '[Comment]',
      },
      timestamp: new Date(changeValue.created_time ? changeValue.created_time * 1000 : data._entryTime),
      rawPayload: data,
    };
  }

  /**
   * Normalize postback message (button clicks)
   */
  private normalizePostbackMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null {
    const data = event.data as FacebookMessagingEvent & { _entryTime: number };
    const postback = data.postback;

    if (!postback) return null;

    const senderId = data.sender.id;
    const pageId = data.recipient.id;

    return {
      platform: Platform.FACEBOOK,
      platformMessageId: `postback_${senderId}_${data.timestamp}`,
      platformConversationId: `${senderId}_${pageId}`,
      platformAccountId: event.platformAccountId,
      sender: {
        platformUserId: senderId,
        name: '',
        avatar: undefined,
      },
      message: {
        type: MessageType.QUICK_REPLY,
        text: `[Postback: ${postback.title}]`,
        quickReply: {
          payload: postback.payload,
        },
      },
      timestamp: new Date(data.timestamp),
      rawPayload: data,
    };
  }

  /**
   * Extract message content from Facebook message
   */
  private extractMessageContent(message: FacebookMessage): NormalizedMessageContent {
    // Text message
    if (message.text && !message.attachments?.length) {
      return this.createTextContent(message.text);
    }

    // Quick reply
    if (message.quick_reply) {
      return {
        type: MessageType.QUICK_REPLY,
        text: message.text || '',
        quickReply: {
          payload: message.quick_reply.payload,
        },
      };
    }

    // Attachment message
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      return this.extractAttachmentContent(attachment, message.text);
    }

    return this.createEmptyContent();
  }

  /**
   * Extract content from attachment
   */
  private extractAttachmentContent(
    attachment: FacebookAttachment,
    text?: string,
  ): NormalizedMessageContent {
    const type = this.mapFacebookAttachmentType(attachment.type);

    switch (attachment.type) {
      case 'image':
      case 'video':
      case 'audio':
      case 'file':
        return this.createMediaContent(
          type,
          attachment.payload?.url || '',
          attachment.type,
          undefined,
          attachment.payload?.title,
        );

      case 'location':
        if (attachment.payload?.coordinates) {
          return this.createLocationContent(
            attachment.payload.coordinates.lat,
            attachment.payload.coordinates.long,
          );
        }
        break;

      case 'fallback':
        // Fallback is used for unsupported content
        return {
          type: MessageType.UNKNOWN,
          text: attachment.payload?.title || text || '[Unsupported content]',
        };
    }

    return this.createEmptyContent();
  }

  /**
   * Map Facebook attachment type to MessageType
   */
  private mapFacebookAttachmentType(fbType: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      file: MessageType.FILE,
      location: MessageType.LOCATION,
      template: MessageType.UNKNOWN,
      fallback: MessageType.UNKNOWN,
    };
    return typeMap[fbType] || MessageType.UNKNOWN;
  }

  /**
   * Extract conversation key from event
   */
  extractConversationKey(event: ParsedWebhookEvent): string {
    if (event.type === 'message' || event.type === 'postback') {
      const data = event.data as FacebookMessagingEvent;
      return `${data.sender.id}_${data.recipient.id}`;
    }

    if (event.type === 'comment') {
      const data = event.data as { change: FacebookChange };
      const postId = data.change.value.post_id;
      return `post_${postId}_${event.platformAccountId}`;
    }

    return '';
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
    return ['message', 'comment', 'postback'].includes(event.type);
  }
}
