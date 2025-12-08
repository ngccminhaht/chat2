import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Platform } from '@/common/constants';
import {
  BaseMessageSender,
  SendTextParams,
  SendImageParams,
  SendFileParams,
  SendStickerParams,
  SendResult,
} from '@/common/platform';
import { ZaloSendResponse } from './types/zalo-webhook.types';

/**
 * Zalo Message Sender
 * Handles sending messages via Zalo OA API
 */
@Injectable()
export class ZaloSenderHandler extends BaseMessageSender {
  readonly platform = Platform.ZALO;
  private readonly apiBaseUrl = 'https://openapi.zalo.me';

  constructor() {
    super('ZaloSenderHandler');
  }

  /**
   * Send text message
   */
  async sendText(params: SendTextParams): Promise<SendResult> {
    try {
      const response = await axios.post<ZaloSendResponse>(
        `${this.apiBaseUrl}/v3.0/oa/message/cs`,
        {
          recipient: { user_id: params.recipientId },
          message: { text: params.text },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: params.accessToken,
          },
        },
      );

      if (response.data.error !== 0) {
        this.logSend('text', params.recipientId, false);
        return this.createErrorResult(
          response.data.message,
          response.data.error.toString(),
          response.data,
        );
      }

      this.logSend('text', params.recipientId, true);
      return this.createSuccessResult(
        response.data.data?.message_id || '',
        response.data,
      );
    } catch (error) {
      this.logSend('text', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send image message
   */
  async sendImage(params: SendImageParams): Promise<SendResult> {
    try {
      const response = await axios.post<ZaloSendResponse>(
        `${this.apiBaseUrl}/v3.0/oa/message/cs`,
        {
          recipient: { user_id: params.recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'media',
                elements: [
                  {
                    media_type: 'image',
                    url: params.imageUrl,
                  },
                ],
              },
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: params.accessToken,
          },
        },
      );

      if (response.data.error !== 0) {
        this.logSend('image', params.recipientId, false);
        return this.createErrorResult(
          response.data.message,
          response.data.error.toString(),
          response.data,
        );
      }

      this.logSend('image', params.recipientId, true);
      return this.createSuccessResult(
        response.data.data?.message_id || '',
        response.data,
      );
    } catch (error) {
      this.logSend('image', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send file message
   */
  async sendFile(params: SendFileParams): Promise<SendResult> {
    try {
      const response = await axios.post<ZaloSendResponse>(
        `${this.apiBaseUrl}/v3.0/oa/message/cs`,
        {
          recipient: { user_id: params.recipientId },
          message: {
            attachment: {
              type: 'file',
              payload: {
                url: params.fileUrl,
              },
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: params.accessToken,
          },
        },
      );

      if (response.data.error !== 0) {
        this.logSend('file', params.recipientId, false);
        return this.createErrorResult(
          response.data.message,
          response.data.error.toString(),
          response.data,
        );
      }

      this.logSend('file', params.recipientId, true);
      return this.createSuccessResult(
        response.data.data?.message_id || '',
        response.data,
      );
    } catch (error) {
      this.logSend('file', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send sticker message
   */
  async sendSticker(params: SendStickerParams): Promise<SendResult> {
    try {
      const response = await axios.post<ZaloSendResponse>(
        `${this.apiBaseUrl}/v3.0/oa/message/cs`,
        {
          recipient: { user_id: params.recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'media',
                elements: [
                  {
                    media_type: 'sticker',
                    attachment_id: params.stickerId,
                  },
                ],
              },
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: params.accessToken,
          },
        },
      );

      if (response.data.error !== 0) {
        this.logSend('sticker', params.recipientId, false);
        return this.createErrorResult(
          response.data.message,
          response.data.error.toString(),
          response.data,
        );
      }

      this.logSend('sticker', params.recipientId, true);
      return this.createSuccessResult(
        response.data.data?.message_id || '',
        response.data,
      );
    } catch (error) {
      this.logSend('sticker', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send GIF message
   */
  async sendGif(
    accessToken: string,
    recipientId: string,
    gifUrl: string,
  ): Promise<SendResult> {
    try {
      const response = await axios.post<ZaloSendResponse>(
        `${this.apiBaseUrl}/v3.0/oa/message/cs`,
        {
          recipient: { user_id: recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'media',
                elements: [
                  {
                    media_type: 'gif',
                    url: gifUrl,
                  },
                ],
              },
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
        },
      );

      if (response.data.error !== 0) {
        return this.createErrorResult(
          response.data.message,
          response.data.error.toString(),
          response.data,
        );
      }

      return this.createSuccessResult(
        response.data.data?.message_id || '',
        response.data,
      );
    } catch (error) {
      return this.handleAxiosError(error);
    }
  }

  /**
   * Check supported message types
   * Zalo supports text, image, file, and sticker
   */
  supports(type: 'text' | 'image' | 'file' | 'sticker' | 'location'): boolean {
    return ['text', 'image', 'file', 'sticker'].includes(type);
  }
}
