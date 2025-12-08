import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { Platform } from '@/common/constants';
import { EnvService } from '@/common/env';
import {
  BaseMessageSender,
  SendTextParams,
  SendImageParams,
  SendFileParams,
  SendResult,
} from '@/common/platform';
import { ShopeeSendResponse } from './types/shopee-webhook.types';

/**
 * Shopee Message Sender
 * Handles sending messages via Shopee Chat API
 */
@Injectable()
export class ShopeeSenderHandler extends BaseMessageSender {
  readonly platform = Platform.SHOPEE;

  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly envService: EnvService) {
    super('ShopeeSenderHandler');
    this.partnerId = this.envService.get('SHOPEE_PARTNER_ID');
    this.partnerKey = this.envService.get('SHOPEE_PARTNER_KEY');
    this.apiBaseUrl = this.envService.get('SHOPEE_API_URL') || 'https://partner.shopeemobile.com';
  }

  /**
   * Send text message
   */
  async sendText(params: SendTextParams): Promise<SendResult> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/sellerchat/send_message';
      const sign = this.generateSignature(path, timestamp, params.accessToken, params.platformAccountId);

      const response = await axios.post<ShopeeSendResponse>(
        `${this.apiBaseUrl}${path}`,
        {
          to_id: parseInt(params.recipientId),
          message_type: 'text',
          content: {
            text: params.text,
          },
        },
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
            access_token: params.accessToken,
            shop_id: params.platformAccountId,
          },
        },
      );

      if (response.data.error) {
        this.logSend('text', params.recipientId, false);
        return this.createErrorResult(
          response.data.message || response.data.error,
          response.data.error,
          response.data,
        );
      }

      this.logSend('text', params.recipientId, true);
      return this.createSuccessResult(
        response.data.response?.message_id || '',
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
      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/sellerchat/send_message';
      const sign = this.generateSignature(path, timestamp, params.accessToken, params.platformAccountId);

      const response = await axios.post<ShopeeSendResponse>(
        `${this.apiBaseUrl}${path}`,
        {
          to_id: parseInt(params.recipientId),
          message_type: 'image',
          content: {
            url: params.imageUrl,
          },
        },
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
            access_token: params.accessToken,
            shop_id: params.platformAccountId,
          },
        },
      );

      if (response.data.error) {
        this.logSend('image', params.recipientId, false);
        return this.createErrorResult(
          response.data.message || response.data.error,
          response.data.error,
          response.data,
        );
      }

      this.logSend('image', params.recipientId, true);
      return this.createSuccessResult(
        response.data.response?.message_id || '',
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
      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/sellerchat/send_message';
      const sign = this.generateSignature(path, timestamp, params.accessToken, params.platformAccountId);

      const response = await axios.post<ShopeeSendResponse>(
        `${this.apiBaseUrl}${path}`,
        {
          to_id: parseInt(params.recipientId),
          message_type: 'file',
          content: {
            url: params.fileUrl,
            file_name: params.fileName,
          },
        },
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
            access_token: params.accessToken,
            shop_id: params.platformAccountId,
          },
        },
      );

      if (response.data.error) {
        this.logSend('file', params.recipientId, false);
        return this.createErrorResult(
          response.data.message || response.data.error,
          response.data.error,
          response.data,
        );
      }

      this.logSend('file', params.recipientId, true);
      return this.createSuccessResult(
        response.data.response?.message_id || '',
        response.data,
      );
    } catch (error) {
      this.logSend('file', params.recipientId, false);
      return this.handleAxiosError(error);
    }
  }

  /**
   * Generate Shopee API signature
   */
  private generateSignature(
    path: string,
    timestamp: number,
    accessToken: string,
    shopId: string,
  ): string {
    const baseString = `${this.partnerId}${path}${timestamp}${accessToken}${shopId}`;
    return createHmac('sha256', this.partnerKey)
      .update(baseString)
      .digest('hex');
  }

  /**
   * Check supported message types
   */
  supports(type: 'text' | 'image' | 'file' | 'sticker' | 'location'): boolean {
    return ['text', 'image', 'file'].includes(type);
  }
}
