import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Platform } from '@/common/constants';
import {
  BaseMessageSender,
  SendTextParams,
  SendImageParams,
  SendFileParams,
  SendResult,
} from '@/common/platform';
import { FacebookSendResponse } from './types/facebook-webhook.types';

/**
 * Facebook Message Sender
 * Handles sending messages via Facebook Messenger Send API
 */
@Injectable()
export class FacebookSenderHandler extends BaseMessageSender {
  readonly platform = Platform.FACEBOOK;
  private readonly graphApiVersion = 'v19.0';

  constructor() {
    super('FacebookSenderHandler', 'https://graph.facebook.com');
  }

  /**
   * Send text message
   */
  async sendText(params: SendTextParams): Promise<SendResult> {
    try {
      const response = await this.httpClient.post<FacebookSendResponse>(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: params.recipientId },
          message: { text: params.text },
        },
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
          },
        },
      );

      if (response.data.error) {
        this.logSend('text', params.recipientId, false);
        return this.createErrorResult(
          response.data.error.message,
          response.data.error.code?.toString(),
          response.data,
        );
      }

      this.logSend('text', params.recipientId, true);
      return this.createSuccessResult(response.data.message_id, response.data);
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
      const response = await this.httpClient.post<FacebookSendResponse>(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: params.recipientId },
          message: {
            attachment: {
              type: 'image',
              payload: {
                url: params.imageUrl,
                is_reusable: true,
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
          },
        },
      );

      if (response.data.error) {
        this.logSend('image', params.recipientId, false);
        return this.createErrorResult(
          response.data.error.message,
          response.data.error.code?.toString(),
          response.data,
        );
      }

      this.logSend('image', params.recipientId, true);
      return this.createSuccessResult(response.data.message_id, response.data);
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
      const response = await this.httpClient.post<FacebookSendResponse>(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: params.recipientId },
          message: {
            attachment: {
              type: 'file',
              payload: {
                url: params.fileUrl,
                is_reusable: true,
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
          },
        },
      );

      if (response.data.error) {
        this.logSend('file', params.recipientId, false);
        return this.createErrorResult(
          response.data.error.message,
          response.data.error.code?.toString(),
          response.data,
        );
      }

      this.logSend('file', params.recipientId, true);
      return this.createSuccessResult(response.data.message_id, response.data);
    } catch (error) {
      this.logSend('file', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send video message
   */
  async sendVideo(
    accessToken: string,
    recipientId: string,
    videoUrl: string,
  ): Promise<SendResult> {
    try {
      const response = await this.httpClient.post<FacebookSendResponse>(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'video',
              payload: {
                url: videoUrl,
                is_reusable: true,
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.data.error) {
        return this.createErrorResult(
          response.data.error.message,
          response.data.error.code?.toString(),
          response.data,
        );
      }

      return this.createSuccessResult(response.data.message_id, response.data);
    } catch (error) {
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send audio message
   */
  async sendAudio(
    accessToken: string,
    recipientId: string,
    audioUrl: string,
  ): Promise<SendResult> {
    try {
      const response = await this.httpClient.post<FacebookSendResponse>(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'audio',
              payload: {
                url: audioUrl,
                is_reusable: true,
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.data.error) {
        return this.createErrorResult(
          response.data.error.message,
          response.data.error.code?.toString(),
          response.data,
        );
      }

      return this.createSuccessResult(response.data.message_id, response.data);
    } catch (error) {
      return this.handleAxiosError(error);
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(
    accessToken: string,
    recipientId: string,
    isTyping: boolean,
  ): Promise<void> {
    try {
      await this.httpClient.post(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          sender_action: isTyping ? 'typing_on' : 'typing_off',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    } catch (error) {
      this.logger.debug(`Failed to send typing indicator: ${error.message}`);
    }
  }

  /**
   * Mark message as seen
   */
  async markSeen(accessToken: string, recipientId: string): Promise<void> {
    try {
      await this.httpClient.post(
        `/${this.graphApiVersion}/me/messages`,
        {
          recipient: { id: recipientId },
          sender_action: 'mark_seen',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    } catch (error) {
      this.logger.debug(`Failed to mark seen: ${error.message}`);
    }
  }

  /**
   * Check supported message types
   */
  supports(type: 'text' | 'image' | 'file' | 'sticker' | 'location'): boolean {
    // Facebook supports text, image, file, but not sticker or location sending
    return ['text', 'image', 'file'].includes(type);
  }
}
