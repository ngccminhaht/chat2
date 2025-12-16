/**
 * Web Platform Adapter
 * Handles web chat widget messages via direct WebSocket (no webhooks)
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Platform, MessageType, MessageDirection } from '@/common/constants';
import {
  BasePlatformAdapter,
  PlatformEvent,
  MessageEvent,
  NormalizedMessage,
  OutboundMessage,
  PlatformPayload,
  SendResult,
  UserProfile,
} from '../core/interfaces';
import { PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';

/** Payload structure for web chat messages */
export interface WebMessagePayload {
  visitorId: string;
  organizationId: string;
  messageId?: string;
  type?: MessageType;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  fileSize?: number;
  timestamp?: number;
}

@Injectable()
export class WebPlatformAdapter extends BasePlatformAdapter {
  readonly platform = Platform.WEB;
  private readonly logger = new Logger(WebPlatformAdapter.name);

  /**
   * Web platform uses WebSocket auth, not webhook signatures
   * Always returns true - actual auth handled by WebSocket gateway
   */
  verifySignature(): boolean {
    return true;
  }

  /**
   * Extract organization ID from payload
   */
  extractAccountId(payload: unknown): string {
    const webPayload = payload as WebMessagePayload;
    return webPayload.organizationId || 'unknown';
  }

  /**
   * Web messages come directly, not in batched webhook format
   * Returns single event array
   */
  extractEvents(payload: unknown): PlatformEvent[] {
    const msg = payload as WebMessagePayload;

    if (!msg.visitorId || !msg.organizationId) {
      return [];
    }

    const event: MessageEvent = {
      type: 'message',
      senderId: msg.visitorId,
      recipientId: msg.organizationId,
      timestamp: new Date(msg.timestamp || Date.now()),
      messageId: msg.messageId || randomUUID(),
      messageType: msg.type || MessageType.TEXT,
      content: {
        text: msg.text,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
      },
      rawPayload: payload,
    };

    return [event];
  }

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
        platform: Platform.WEB,
      },
    };
  }

  /**
   * Conversation key format: web_{organizationId}_{visitorId}
   */
  getConversationKey(
    visitorId: string,
    organizationId: string,
    _payload?: unknown,
  ): string {
    return `web_${organizationId}_${visitorId}`;
  }

  formatOutbound(message: OutboundMessage): PlatformPayload {
    return {
      type: message.type,
      text: message.content.text,
      mediaUrl: message.content.mediaUrl,
      mediaType: message.content.mediaType,
      fileName: message.content.fileName,
    };
  }

  /**
   * Web messages sent via WebSocket, not external API
   * Actual WebSocket emit happens in VisitorGateway
   */
  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult> {
    const messageId = randomUUID();
    this.logger.debug(`Preparing web message ${messageId} for ${recipientId}`);

    return {
      success: true,
      platformMessageId: messageId,
    };
  }

  /**
   * Visitor profile from pre-chat form or stored session
   */
  async fetchUserProfile(
    connection: PlatformConnectionDocument,
    visitorId: string,
  ): Promise<UserProfile> {
    return this.createDefaultProfile(visitorId, 'Visitor');
  }
}
