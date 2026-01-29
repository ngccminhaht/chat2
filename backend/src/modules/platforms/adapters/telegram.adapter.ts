/**
 * Telegram Bot Platform Adapter
 * Implements IPlatformAdapter for Telegram-specific logic
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Platform, MessageType, MessageDirection } from '@/common/constants';
import { PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';
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

/**
 * Telegram Update payload structure
 */
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  document?: TelegramDocument;
  sticker?: TelegramSticker;
  location?: TelegramLocation;
  caption?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumbnail?: TelegramPhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  type: string;
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
}

interface TelegramLocation {
  latitude: number;
  longitude: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

@Injectable()
export class TelegramAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TELEGRAM;
  private readonly logger = new Logger(TelegramAdapter.name);
  private readonly apiBaseUrl = 'https://api.telegram.org/bot';

  // ==================== Webhook Verification ====================

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    // Telegram uses secret_token header for webhook verification
    // Simple string comparison
    return signature === secret;
  }

  // ==================== Webhook Parsing ====================

  extractAccountId(payload: unknown): string {
    // Bot ID is injected by controller as _botId field
    // This matches platformAccountId stored in database
    const update = payload as TelegramUpdate & { _botId?: string };
    if (update._botId) {
      return update._botId;
    }
    // Fallback: should not reach here if controller properly injects _botId
    this.logger.warn('No _botId found in payload, using chat.id as fallback');
    const message = update.message || update.edited_message;
    if (message) {
      return message.chat.id.toString();
    }
    return 'unknown';
  }

  extractEvents(payload: unknown): PlatformEvent[] {
    const update = payload as TelegramUpdate;
    const events: PlatformEvent[] = [];

    this.logger.log(`🔍 Extracting events from Telegram update: ${update.update_id}`);

    // Handle regular message
    if (update.message) {
      const event = this.parseMessageEvent(update.message);
      if (event) {
        events.push(event);
        this.logger.log(`  ✅ Parsed message event: ${event.messageId}`);
      }
    }

    // Handle edited message (treat as new message for simplicity)
    if (update.edited_message) {
      const event = this.parseMessageEvent(update.edited_message);
      if (event) {
        events.push(event);
        this.logger.log(`  ✅ Parsed edited message event: ${event.messageId}`);
      }
    }

    // Handle callback query (button clicks)
    if (update.callback_query) {
      const event = this.parseCallbackQuery(update.callback_query);
      if (event) {
        events.push(event);
        this.logger.log(`  ✅ Parsed callback query: ${event.messageId}`);
      }
    }

    this.logger.log(`  📊 Total events extracted: ${events.length}`);
    return events;
  }

  private parseMessageEvent(message: TelegramMessage): MessageEvent | null {
    // Skip bot messages
    if (message.from?.is_bot) {
      return null;
    }

    const senderId = message.from?.id?.toString() || message.chat.id.toString();
    const recipientId = message.chat.id.toString(); // Chat ID is the conversation context
    const timestamp = new Date(message.date * 1000);
    const messageId = `${message.chat.id}_${message.message_id}`;

    const { messageType, content } = this.extractContent(message);

    return {
      type: 'message',
      senderId,
      recipientId,
      timestamp,
      messageId,
      messageType,
      content,
      rawPayload: message,
    };
  }

  private parseCallbackQuery(query: TelegramCallbackQuery): MessageEvent | null {
    const senderId = query.from.id.toString();
    const recipientId = query.message?.chat.id.toString() || senderId;
    const timestamp = query.message ? new Date(query.message.date * 1000) : new Date();
    const messageId = `callback_${query.id}`;

    return {
      type: 'message',
      senderId,
      recipientId,
      timestamp,
      messageId,
      messageType: MessageType.TEXT,
      content: {
        text: `[Button: ${query.data}]`,
      },
      rawPayload: query,
    };
  }

  private extractContent(message: TelegramMessage): {
    messageType: MessageType;
    content: MessageEvent['content'];
  } {
    const content: MessageEvent['content'] = {};

    // Text message
    if (message.text) {
      return {
        messageType: MessageType.TEXT,
        content: { text: message.text },
      };
    }

    // Photo
    if (message.photo && message.photo.length > 0) {
      // Get largest photo
      const largestPhoto = message.photo[message.photo.length - 1];
      content.mediaUrl = largestPhoto.file_id; // Will need to convert to URL
      content.mediaType = 'image';
      content.text = message.caption;
      return { messageType: MessageType.IMAGE, content };
    }

    // Video
    if (message.video) {
      content.mediaUrl = message.video.file_id;
      content.mediaType = 'video';
      content.fileName = message.video.file_name;
      content.fileSize = message.video.file_size;
      content.text = message.caption;
      return { messageType: MessageType.VIDEO, content };
    }

    // Audio
    if (message.audio) {
      content.mediaUrl = message.audio.file_id;
      content.mediaType = 'audio';
      content.fileName = message.audio.file_name;
      content.fileSize = message.audio.file_size;
      content.text = message.caption;
      return { messageType: MessageType.AUDIO, content };
    }

    // Voice
    if (message.voice) {
      content.mediaUrl = message.voice.file_id;
      content.mediaType = 'audio';
      content.fileSize = message.voice.file_size;
      return { messageType: MessageType.AUDIO, content };
    }

    // Document/File
    if (message.document) {
      content.mediaUrl = message.document.file_id;
      content.mediaType = message.document.mime_type;
      content.fileName = message.document.file_name;
      content.fileSize = message.document.file_size;
      content.text = message.caption;
      return { messageType: MessageType.FILE, content };
    }

    // Sticker
    if (message.sticker) {
      content.mediaUrl = message.sticker.file_id;
      content.mediaType = 'sticker';
      content.text = message.sticker.emoji;
      return { messageType: MessageType.STICKER, content };
    }

    // Location
    if (message.location) {
      content.location = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      };
      content.text = `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
      return { messageType: MessageType.LOCATION, content };
    }

    // Default to unknown
    return {
      messageType: MessageType.UNKNOWN,
      content: { text: '[Unsupported message type]' },
    };
  }

  // ==================== Message Normalization ====================

  normalizeMessage(event: MessageEvent): NormalizedMessage {
    const conversationKey = this.getConversationKey(event.senderId, event.recipientId);

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
    // For Telegram, use chatId_senderId pattern
    // recipientId is chat.id, senderId is user.id
    return `${senderId}_${recipientId}`;
  }

  // ==================== Outbound Messages ====================

  formatOutbound(message: OutboundMessage): PlatformPayload {
    const payload: PlatformPayload = {};

    if (message.type === MessageType.TEXT && message.content.text) {
      payload.text = message.content.text;
      payload.parse_mode = 'HTML';
    } else if (message.content.mediaUrl) {
      // For media, we'll need to use different API methods
      payload.mediaUrl = message.content.mediaUrl;
      payload.mediaType = message.type;
      payload.caption = message.content.text;
    }

    return payload;
  }

  async send(
    connection: PlatformConnectionDocument,
    recipientId: string,
    payload: PlatformPayload,
  ): Promise<SendResult> {
    try {
      const botToken = (connection.credentials as any).botToken;
      const baseUrl = `${this.apiBaseUrl}${botToken}`;

      let response;

      if (payload.mediaUrl) {
        // Send media based on type
        const mediaType = payload.mediaType as MessageType;
        const method = this.getMediaMethod(mediaType);
        const mediaField = this.getMediaField(mediaType);

        response = await axios.post(`${baseUrl}/${method}`, {
          chat_id: recipientId,
          [mediaField]: payload.mediaUrl,
          caption: payload.caption,
        });
      } else {
        // Send text message
        response = await axios.post(`${baseUrl}/sendMessage`, {
          chat_id: recipientId,
          text: payload.text,
          parse_mode: payload.parse_mode,
        });
      }

      if (!response.data.ok) {
        return {
          success: false,
          error: response.data.description || 'Unknown error',
        };
      }

      return {
        success: true,
        platformMessageId: `${recipientId}_${response.data.result.message_id}`,
      };
    } catch (error) {
      this.logger.error('Telegram send failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  private getMediaMethod(type: MessageType): string {
    const methodMap: Partial<Record<MessageType, string>> = {
      [MessageType.IMAGE]: 'sendPhoto',
      [MessageType.VIDEO]: 'sendVideo',
      [MessageType.AUDIO]: 'sendAudio',
      [MessageType.FILE]: 'sendDocument',
      [MessageType.STICKER]: 'sendSticker',
      [MessageType.LOCATION]: 'sendLocation',
    };
    return methodMap[type] || 'sendDocument';
  }

  private getMediaField(type: MessageType): string {
    const fieldMap: Partial<Record<MessageType, string>> = {
      [MessageType.IMAGE]: 'photo',
      [MessageType.VIDEO]: 'video',
      [MessageType.AUDIO]: 'audio',
      [MessageType.FILE]: 'document',
      [MessageType.STICKER]: 'sticker',
    };
    return fieldMap[type] || 'document';
  }

  // ==================== User Profile ====================

  async fetchUserProfile(
    connection: PlatformConnectionDocument,
    userId: string,
  ): Promise<UserProfile> {
    try {
      const botToken = (connection.credentials as any).botToken;
      const response = await axios.get(`${this.apiBaseUrl}${botToken}/getChat`, {
        params: { chat_id: userId },
      });

      if (!response.data.ok) {
        return this.createDefaultProfile(userId, 'Telegram');
      }

      const chat = response.data.result;
      const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username;

      // Get profile photo if available
      let avatar: string | undefined;
      if (chat.photo) {
        try {
          const photoResponse = await axios.get(`${this.apiBaseUrl}${botToken}/getFile`, {
            params: { file_id: chat.photo.small_file_id },
          });
          if (photoResponse.data.ok) {
            avatar = `https://api.telegram.org/file/bot${botToken}/${photoResponse.data.result.file_path}`;
          }
        } catch {
          // Ignore photo fetch errors
        }
      }

      return {
        id: userId,
        name: name || `Telegram User ${userId.substring(0, 8)}`,
        avatar,
        metadata: {
          username: chat.username,
          type: chat.type,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch Telegram profile for ${userId}: ${error.message}`);
      return this.createDefaultProfile(userId, 'Telegram');
    }
  }
}
