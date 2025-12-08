import { Platform } from '@/common/constants';
import { IWebhookHandler } from './webhook-handler.interface';
import { IMessageSender } from './message-sender.interface';
import { IOAuthHandler } from './oauth-handler.interface';

/**
 * Platform configuration
 */
export interface PlatformConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  webhookVerifyToken?: string;
  apiBaseUrl?: string;
  apiVersion?: string;
}

/**
 * Platform adapter interface - combines all handlers for a platform
 * Each platform (Facebook, Zalo, Shopee, TikTok) must implement this
 */
export interface IPlatformAdapter {
  /**
   * Platform identifier
   */
  readonly platform: Platform;

  /**
   * Platform display name
   */
  readonly displayName: string;

  /**
   * Webhook handler for this platform
   */
  readonly webhook: IWebhookHandler;

  /**
   * Message sender for this platform
   */
  readonly sender: IMessageSender;

  /**
   * OAuth handler for this platform
   */
  readonly oauth: IOAuthHandler;

  /**
   * Get webhook verify token for platform verification (GET request)
   * Facebook and Shopee use this pattern
   */
  getWebhookVerifyToken?(): string;

  /**
   * Get app secret for signature verification
   */
  getAppSecret(): string;

  /**
   * Check if platform is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get supported message types for this platform
   */
  getSupportedMessageTypes(): string[];
}

/**
 * Injection tokens for platform adapters
 */
export const FACEBOOK_ADAPTER = Symbol('FACEBOOK_ADAPTER');
export const ZALO_ADAPTER = Symbol('ZALO_ADAPTER');
export const SHOPEE_ADAPTER = Symbol('SHOPEE_ADAPTER');
export const TIKTOK_ADAPTER = Symbol('TIKTOK_ADAPTER');
