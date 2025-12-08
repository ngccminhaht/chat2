import { Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Platform } from '@/common/constants';
import {
  IMessageSender,
  SendTextParams,
  SendImageParams,
  SendFileParams,
  SendStickerParams,
  SendLocationParams,
  SendResult,
} from '../interfaces';

/**
 * Base message sender with common functionality
 * Platform-specific senders should extend this class
 */
export abstract class BaseMessageSender implements IMessageSender {
  protected readonly logger: Logger;
  protected readonly httpClient: AxiosInstance;
  abstract readonly platform: Platform;

  constructor(loggerContext: string, baseURL?: string) {
    this.logger = new Logger(loggerContext);
    this.httpClient = axios.create({
      baseURL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send text message
   * Must be implemented by platform-specific handlers
   */
  abstract sendText(params: SendTextParams): Promise<SendResult>;

  /**
   * Send image message
   * Must be implemented by platform-specific handlers
   */
  abstract sendImage(params: SendImageParams): Promise<SendResult>;

  /**
   * Send file message
   * Must be implemented by platform-specific handlers
   */
  abstract sendFile(params: SendFileParams): Promise<SendResult>;

  /**
   * Send sticker message
   * Optional - override if platform supports stickers
   */
  async sendSticker(params: SendStickerParams): Promise<SendResult> {
    return this.createUnsupportedResult('sticker');
  }

  /**
   * Send location message
   * Optional - override if platform supports location
   */
  async sendLocation(params: SendLocationParams): Promise<SendResult> {
    return this.createUnsupportedResult('location');
  }

  /**
   * Check if sender supports a message type
   */
  supports(type: 'text' | 'image' | 'file' | 'sticker' | 'location'): boolean {
    // Text, image, file are required for all platforms
    if (['text', 'image', 'file'].includes(type)) {
      return true;
    }
    // Sticker and location are optional
    return false;
  }

  /**
   * Helper: Create success result
   */
  protected createSuccessResult(
    platformMessageId: string,
    rawResponse?: unknown,
  ): SendResult {
    return {
      success: true,
      platformMessageId,
      rawResponse,
    };
  }

  /**
   * Helper: Create error result
   */
  protected createErrorResult(
    error: string,
    errorCode?: string,
    rawResponse?: unknown,
  ): SendResult {
    return {
      success: false,
      error,
      errorCode,
      rawResponse,
    };
  }

  /**
   * Helper: Create unsupported message type result
   */
  protected createUnsupportedResult(type: string): SendResult {
    return {
      success: false,
      error: `${type} messages are not supported for ${this.platform}`,
      errorCode: 'UNSUPPORTED_MESSAGE_TYPE',
    };
  }

  /**
   * Helper: Handle axios errors
   */
  protected handleAxiosError(error: unknown): SendResult {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as Record<string, unknown> | undefined;

      return this.createErrorResult(
        responseData?.message?.toString() ||
          responseData?.error?.toString() ||
          axiosError.message,
        axiosError.response?.status?.toString(),
        responseData,
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return this.createErrorResult(errorMessage);
  }

  /**
   * Helper: Log send operation
   */
  protected logSend(type: string, recipientId: string, success: boolean): void {
    if (success) {
      this.logger.log(`Sent ${type} message to ${recipientId} on ${this.platform}`);
    } else {
      this.logger.error(`Failed to send ${type} message to ${recipientId} on ${this.platform}`);
    }
  }
}
