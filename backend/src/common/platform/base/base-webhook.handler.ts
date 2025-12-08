import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';
import { Platform, MessageType } from '@/common/constants';
import {
  IWebhookHandler,
  ParsedWebhookEvent,
  NormalizedIncomingMessage,
  NormalizedMessageContent,
} from '../interfaces';

/**
 * Base webhook handler with common functionality
 * Platform-specific handlers should extend this class
 */
export abstract class BaseWebhookHandler implements IWebhookHandler {
  protected readonly logger: Logger;
  protected abstract readonly platform: Platform;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Default signature verification using HMAC-SHA256
   * Override if platform uses different algorithm
   */
  verifySignature(payload: unknown, signature: string, secret: string): boolean {
    try {
      const payloadString =
        typeof payload === 'string' ? payload : JSON.stringify(payload);

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      // Check both with and without prefix
      const signatureWithoutPrefix = signature.replace(/^sha256=/, '');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signatureWithoutPrefix),
      );
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Parse webhook payload into events
   * Must be implemented by platform-specific handlers
   */
  abstract parseWebhook(payload: unknown): ParsedWebhookEvent[];

  /**
   * Normalize a parsed event into standard message format
   * Must be implemented by platform-specific handlers
   */
  abstract normalizeMessage(event: ParsedWebhookEvent): NormalizedIncomingMessage | null;

  /**
   * Extract conversation key
   * Must be implemented by platform-specific handlers
   */
  abstract extractConversationKey(event: ParsedWebhookEvent): string;

  /**
   * Extract platform account ID
   * Must be implemented by platform-specific handlers
   */
  abstract extractPlatformAccountId(event: ParsedWebhookEvent): string;

  /**
   * Check if event should create a message
   * Override if platform has non-message events
   */
  isMessageEvent(event: ParsedWebhookEvent): boolean {
    return event.type === 'message';
  }

  /**
   * Helper: Map common attachment types to MessageType
   */
  protected mapAttachmentType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      file: MessageType.FILE,
      sticker: MessageType.STICKER,
      location: MessageType.LOCATION,
      gif: MessageType.IMAGE, // GIF treated as IMAGE
    };
    return typeMap[type.toLowerCase()] || MessageType.UNKNOWN;
  }

  /**
   * Helper: Create empty message content
   */
  protected createEmptyContent(): NormalizedMessageContent {
    return { type: MessageType.UNKNOWN };
  }

  /**
   * Helper: Create text message content
   */
  protected createTextContent(text: string): NormalizedMessageContent {
    return { type: MessageType.TEXT, text };
  }

  /**
   * Helper: Create media message content
   */
  protected createMediaContent(
    type: MessageType,
    url: string,
    mediaType?: string,
    thumbnailUrl?: string,
    fileName?: string,
    fileSize?: number,
  ): NormalizedMessageContent {
    return {
      type,
      media: {
        url,
        type: mediaType || type,
        thumbnailUrl,
        fileName,
        fileSize,
      },
    };
  }

  /**
   * Helper: Create sticker message content
   */
  protected createStickerContent(stickerId: string, url?: string): NormalizedMessageContent {
    return {
      type: MessageType.STICKER,
      sticker: { stickerId, url },
    };
  }

  /**
   * Helper: Create location message content
   */
  protected createLocationContent(
    latitude: number,
    longitude: number,
    name?: string,
  ): NormalizedMessageContent {
    return {
      type: MessageType.LOCATION,
      location: { latitude, longitude, name },
    };
  }

  /**
   * Helper: Generate unique message ID if platform doesn't provide one
   */
  protected generateMessageId(): string {
    return `${this.platform}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}
