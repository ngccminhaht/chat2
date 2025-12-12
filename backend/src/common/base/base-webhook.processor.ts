/**
 * Base Webhook Processor
 * Abstract class to eliminate duplication across platform webhook services
 */

import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  Platform,
  MessageDirection,
  MessageType,
  ConversationStatus,
  ConnectionStatus,
  MessageStatus,
} from '../constants';
import {
  NormalizedMessage,
  WebhookProcessingResult,
} from '../types';

export interface WebhookSignatureVerifier {
  verify(payload: unknown, signature: string): boolean;
}

export interface WebhookMessageNormalizer<T = unknown> {
  normalize(payload: T): NormalizedMessage;
}

/**
 * Abstract base class for webhook processing
 * Implements Template Method pattern
 */
export abstract class BaseWebhookProcessor<TPayload = unknown>
  implements WebhookSignatureVerifier, WebhookMessageNormalizer<TPayload>
{
  protected readonly logger: Logger;

  constructor(
    protected readonly platform: Platform,
    protected readonly platformConnectionModel: Model<any>,
    protected readonly conversationModel: Model<any>,
    protected readonly messageModel: Model<any>,
  ) {
    this.logger = new Logger(`${platform}WebhookProcessor`);
  }

  /**
   * Template method: Full webhook processing pipeline
   */
  async processWebhook(
    payload: TPayload,
    signature: string,
  ): Promise<WebhookProcessingResult> {
    try {
      // Step 1: Verify signature
      const isValid = this.verify(payload, signature);
      if (!isValid) {
        this.logger.warn('Invalid webhook signature');
        return {
          success: false,
          error: 'Invalid signature',
        };
      }

      // Step 2: Get platform connection
      const platformAccountId = this.extractPlatformAccountId(payload);
      const connection = await this.findPlatformConnection(platformAccountId);

      if (!connection) {
        this.logger.warn(
          `Platform connection not found: ${platformAccountId}`,
        );
        return {
          success: false,
          error: 'Platform connection not found',
        };
      }

      // Step 3: Normalize message
      const normalizedMessage = this.normalize(payload);

      // Step 4: Find or create conversation
      const conversation = await this.findOrCreateConversation(
        normalizedMessage,
        connection,
      );

      // Step 5: Save message
      const message = await this.saveMessage(normalizedMessage, conversation);

      // Step 6: Update conversation last message
      await this.updateConversationLastMessage(conversation, message);

      return {
        success: true,
        messageId: message._id.toString(),
        conversationId: conversation._id.toString(),
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Abstract methods to be implemented by platform-specific services
   */
  abstract verify(payload: TPayload, signature: string): boolean;
  abstract normalize(payload: TPayload): NormalizedMessage;
  abstract extractPlatformAccountId(payload: TPayload): string;
  abstract extractSenderInfo(payload: TPayload): {
    id: string;
    name?: string;
  };
  abstract extractConversationId(payload: TPayload): string;

  /**
   * Common helper: Find platform connection
   */
  protected async findPlatformConnection(platformAccountId: string) {
    return this.platformConnectionModel
      .findOne({
        platform: this.platform,
        platformAccountId,
        status: ConnectionStatus.ACTIVE,
      })
      .exec();
  }

  /**
   * Common helper: Find or create conversation
   */
  protected async findOrCreateConversation(
    normalizedMessage: NormalizedMessage,
    connection: any,
  ) {
    const platformConversationId = normalizedMessage.conversationId;

    let conversation = await this.conversationModel
      .findOne({
        platform: this.platform,
        platformConversationId,
      })
      .exec();

    if (!conversation) {
      const senderInfo = this.extractSenderInfo(
        normalizedMessage.metadata.rawPayload as TPayload,
      );

      conversation = await this.conversationModel.create({
        platform: this.platform,
        platformConversationId,
        platformAccountId: connection.platformAccountId,
        participants: [
          {
            platformUserId: senderInfo.id,
            role: 'customer',
            name: senderInfo.name,
          },
        ],
        status: ConversationStatus.OPEN,
        metadata: {
          platformConnectionId: connection._id.toString(),
        },
      });
    }

    return conversation;
  }

  /**
   * Common helper: Save message
   */
  protected async saveMessage(
    normalizedMessage: NormalizedMessage,
    conversation: any,
  ) {
    // Check for duplicate message
    const existingMessage = await this.messageModel
      .findOne({
        platform: this.platform,
        platformMessageId: normalizedMessage.platformMessageId,
      })
      .exec();

    if (existingMessage) {
      return existingMessage;
    }

    // Create new message
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      platform: this.platform,
      platformMessageId: normalizedMessage.platformMessageId,
      direction: normalizedMessage.direction,
      type: normalizedMessage.type,
      senderId: normalizedMessage.senderId,
      content: normalizedMessage.content,
      status: MessageStatus.DELIVERED,
      metadata: normalizedMessage.metadata,
      createdAt: normalizedMessage.timestamp,
    });

    return message;
  }

  /**
   * Common helper: Update conversation's last message
   */
  protected async updateConversationLastMessage(
    conversation: any,
    message: any,
  ) {
    conversation.lastMessage = {
      content: message.content.text || '[Attachment]',
      timestamp: message.createdAt,
    };
    conversation.updatedAt = new Date();
    await conversation.save();
  }

  /**
   * Utility: Determine message type from attachments
   */
  protected getMessageTypeFromAttachments(
    attachments?: Array<{ type: string }>,
  ): MessageType {
    if (!attachments || attachments.length === 0) {
      return MessageType.TEXT;
    }

    const type = attachments[0].type.toLowerCase();
    switch (type) {
      case 'image':
        return MessageType.IMAGE;
      case 'video':
        return MessageType.VIDEO;
      case 'audio':
        return MessageType.AUDIO;
      case 'file':
        return MessageType.FILE;
      case 'sticker':
        return MessageType.STICKER;
      case 'location':
        return MessageType.LOCATION;
      default:
        return MessageType.UNKNOWN;
    }
  }
}
