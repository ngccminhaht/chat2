import { Platform } from '@/common/constants';

/**
 * Common parameters for sending messages
 */
export interface BaseSendParams {
  accessToken: string;
  recipientId: string;
  platformAccountId: string;
}

/**
 * Parameters for sending text messages
 */
export interface SendTextParams extends BaseSendParams {
  text: string;
}

/**
 * Parameters for sending image messages
 */
export interface SendImageParams extends BaseSendParams {
  imageUrl: string;
  caption?: string;
}

/**
 * Parameters for sending file messages
 */
export interface SendFileParams extends BaseSendParams {
  fileUrl: string;
  fileName?: string;
}

/**
 * Parameters for sending sticker messages
 */
export interface SendStickerParams extends BaseSendParams {
  stickerId: string;
}

/**
 * Parameters for sending location messages
 */
export interface SendLocationParams extends BaseSendParams {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Result of sending a message
 */
export interface SendResult {
  success: boolean;
  platformMessageId?: string;
  error?: string;
  errorCode?: string;
  rawResponse?: unknown;
}

/**
 * Message sender interface - each platform must implement this
 */
export interface IMessageSender {
  /**
   * Platform this sender handles
   */
  readonly platform: Platform;

  /**
   * Send a text message
   */
  sendText(params: SendTextParams): Promise<SendResult>;

  /**
   * Send an image message
   */
  sendImage(params: SendImageParams): Promise<SendResult>;

  /**
   * Send a file/attachment message
   */
  sendFile(params: SendFileParams): Promise<SendResult>;

  /**
   * Send a sticker message (optional - not all platforms support)
   */
  sendSticker?(params: SendStickerParams): Promise<SendResult>;

  /**
   * Send a location message (optional - not all platforms support)
   */
  sendLocation?(params: SendLocationParams): Promise<SendResult>;

  /**
   * Check if the sender supports a specific message type
   */
  supports(type: 'text' | 'image' | 'file' | 'sticker' | 'location'): boolean;
}
