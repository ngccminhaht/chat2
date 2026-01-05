/**
 * Zalo OA Platform Adapter
 * Implements IPlatformAdapter for Zalo-specific logic
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import {
  Platform,
  MessageType,
  MessageDirection,
} from '@/common/constants';
import { EnvService } from '@/common/env';
import { PlatformConnectionDocument } from '@/common/database/schemas/platform-connection.schema';

// Zalo error codes that indicate token expiration
const ZALO_TOKEN_EXPIRED_ERRORS = [-216, -124]; // -216: access token expired, -124: invalid access token

// Common Zalo API error codes
const ZALO_ERROR_CODES: Record<number, string> = {
  [-216]: 'Access token expired',
  [-124]: 'Invalid access token',
  [-201]: 'Missing required parameter',
  [-214]: 'User not found or blocked the OA',
  [-229]: 'User ID not found',
  [-218]: 'Insufficient permission',
  0: 'Success',
};
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

    // Handle image - Zalo requires template media format
    if (message.type === MessageType.IMAGE && message.content.mediaUrl) {
      return {
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'media',
              elements: [
                {
                  media_type: 'image',
                  url: message.content.mediaUrl,
                },
              ],
            },
          },
        },
      };
    }

    // Handle file
    if (message.type === MessageType.FILE && message.content.mediaUrl) {
      return {
        message: {
          attachment: {
            type: 'file',
            payload: {
              url: message.content.mediaUrl,
            },
          },
        },
      };
    }

    // Handle other media types (video, audio, sticker)
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

  // ==================== Media Upload ====================

  /**
   * Upload image to Zalo server and get attachment_id
   * Required for sending image attachments via CS message API
   * @param accessToken OA access token
   * @param imageUrl URL of the image to upload
   * @returns attachment_id to use in message
   */
  async uploadImage(
    accessToken: string,
    imageUrl: string,
  ): Promise<{ attachmentId: string } | null> {
    try {
      this.logger.log(`📤 Uploading image to Zalo: ${imageUrl}`);

      // Download image from URL
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';

      // Create form data
      const formData = new FormData();
      formData.append('file', imageBuffer, {
        filename: 'image.jpg',
        contentType,
      });

      // Upload to Zalo image endpoint
      const response = await axios.post(
        'https://openapi.zalo.me/v2.0/oa/upload/image',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            access_token: accessToken,
          },
        },
      );

      this.logger.log(`📥 Zalo image upload response:`, response.data);

      if (response.data.error !== 0) {
        this.logger.error(`❌ Zalo image upload error:`, response.data);
        return null;
      }

      const attachmentId = response.data.data?.attachment_id;
      if (!attachmentId) {
        this.logger.error(`❌ No attachment_id in Zalo upload response`);
        return null;
      }

      this.logger.log(`✅ Image uploaded to Zalo, attachment_id: ${attachmentId}`);
      return { attachmentId };
    } catch (error) {
      this.logger.error(`❌ Failed to upload image to Zalo:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Send image message using attachment_id
   */
  async sendImageWithAttachmentId(
    connection: PlatformConnectionDocument,
    recipientId: string,
    attachmentId: string,
  ): Promise<SendResult> {
    try {
      const accessToken = connection.credentials.accessToken;

      const requestBody = {
        recipient: {
          user_id: recipientId,
        },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'media',
              elements: [
                {
                  media_type: 'image',
                  attachment_id: attachmentId,
                },
              ],
            },
          },
        },
      };

      this.logger.log(`📤 Sending Zalo image message with attachment_id to ${recipientId}`);

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

      this.logger.log(`📨 Zalo image send response:`, response.data);

      if (response.data.error !== 0) {
        const errorCode = response.data.error;
        const errorMessage = response.data.message || `Zalo error: ${errorCode}`;

        // Check if token expired
        if (ZALO_TOKEN_EXPIRED_ERRORS.includes(errorCode)) {
          return {
            success: false,
            error: errorMessage,
            needsTokenRefresh: true,
          };
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.data?.message_id,
      };
    } catch (error) {
      this.logger.error('❌ Zalo image send failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Upload file to Zalo server and get file token
   * Required for sending file attachments (Zalo doesn't support external URLs for files)
   * @param accessToken OA access token
   * @param fileUrl URL of the file to upload
   * @param fileName Original filename
   * @returns File token to use in message
   */
  async uploadFile(
    accessToken: string,
    fileUrl: string,
    fileName?: string,
  ): Promise<{ token: string } | null> {
    try {
      this.logger.log(`📤 Uploading file to Zalo: ${fileUrl}`);

      // Download file from URL
      const fileResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
      });

      const fileBuffer = Buffer.from(fileResponse.data);
      const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';

      // Create form data
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: fileName || 'file',
        contentType,
      });

      // Upload to Zalo
      const response = await axios.post(
        'https://openapi.zalo.me/v2.0/oa/upload/file',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            access_token: accessToken,
          },
        },
      );

      this.logger.log(`📥 Zalo upload response:`, response.data);

      if (response.data.error !== 0) {
        this.logger.error(`❌ Zalo upload error:`, response.data);
        return null;
      }

      const token = response.data.data?.token;
      if (!token) {
        this.logger.error(`❌ No token in Zalo upload response`);
        return null;
      }

      this.logger.log(`✅ File uploaded to Zalo, token: ${token.substring(0, 20)}...`);
      return { token };
    } catch (error) {
      this.logger.error(`❌ Failed to upload file to Zalo:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Send file message using file token
   */
  async sendFileWithToken(
    connection: PlatformConnectionDocument,
    recipientId: string,
    fileToken: string,
  ): Promise<SendResult> {
    try {
      const accessToken = connection.credentials.accessToken;

      const requestBody = {
        recipient: {
          user_id: recipientId,
        },
        message: {
          attachment: {
            type: 'file',
            payload: {
              token: fileToken,
            },
          },
        },
      };

      this.logger.log(`📤 Sending Zalo file message with token to ${recipientId}`);

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

      this.logger.log(`📨 Zalo file send response:`, response.data);

      if (response.data.error !== 0) {
        return {
          success: false,
          error: response.data.message || `Zalo error: ${response.data.error}`,
        };
      }

      return {
        success: true,
        platformMessageId: response.data.data?.message_id,
      };
    } catch (error) {
      this.logger.error('❌ Zalo file send failed:', error.response?.data || error.message);
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

      this.logger.log(`📋 Fetching Zalo profile for user ${userId}`);

      // Use v3.0 API (v2.0/oa/getprofile has been shut down as of June 2024)
      // See: https://go.zalo.me/upgrade-api-06_2024
      const response = await axios.get(
        'https://openapi.zalo.me/v3.0/oa/user/detail',
        {
          headers: {
            access_token: accessToken,
          },
          params: {
            data: JSON.stringify({ user_id: userId }),
          },
        },
      );

      this.logger.debug(`Zalo getprofile response:`, response.data);

      if (response.data.error !== 0) {
        const errorCode = response.data.error;
        const errorMessage = response.data.message || ZALO_ERROR_CODES[errorCode] || 'Unknown error';

        this.logger.warn(`⚠️ Zalo getprofile error ${errorCode}: ${errorMessage}`, {
          userId,
          errorCode,
          errorMessage,
          knownError: ZALO_ERROR_CODES[errorCode],
        });
        return this.createDefaultProfile(userId, 'Zalo');
      }

      const userData = response.data.data;
      const profile = {
        id: userId,
        name: userData.display_name || userData.user_alias || `Zalo User`,
        avatar: userData.avatars?.['120'] || userData.avatar,
      };

      this.logger.log(`✅ Zalo profile fetched: ${profile.name}`);
      return profile;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch Zalo profile for ${userId}:`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      return this.createDefaultProfile(userId, 'Zalo');
    }
  }
}
