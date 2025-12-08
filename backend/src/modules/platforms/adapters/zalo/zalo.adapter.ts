import { Injectable } from '@nestjs/common';
import { Platform, MessageType } from '@/common/constants';
import { EnvService } from '@/common/env';
import { IPlatformAdapter } from '@/common/platform';
import { ZaloWebhookHandler } from './zalo-webhook.handler';
import { ZaloOAuthHandler } from './zalo-oauth.handler';
import { ZaloSenderHandler } from './zalo-sender.handler';

/**
 * Zalo Platform Adapter
 * Combines webhook, OAuth, and message sender handlers for Zalo OA
 */
@Injectable()
export class ZaloAdapter implements IPlatformAdapter {
  readonly platform = Platform.ZALO;
  readonly displayName = 'Zalo OA';

  private readonly appSecret: string;

  constructor(
    readonly webhook: ZaloWebhookHandler,
    readonly oauth: ZaloOAuthHandler,
    readonly sender: ZaloSenderHandler,
    private readonly envService: EnvService,
  ) {
    this.appSecret = this.envService.get('ZALO_APP_SECRET');
  }

  /**
   * Zalo doesn't use webhook verification token
   */
  getWebhookVerifyToken(): string | undefined {
    return undefined;
  }

  /**
   * Get app secret for signature verification
   */
  getAppSecret(): string {
    return this.appSecret;
  }

  /**
   * Check if adapter is properly configured
   */
  isConfigured(): boolean {
    const appId = this.envService.get('ZALO_APP_ID');
    return !!(appId && this.appSecret);
  }

  /**
   * Get supported message types
   */
  getSupportedMessageTypes(): string[] {
    return [
      MessageType.TEXT,
      MessageType.IMAGE,
      MessageType.FILE,
      MessageType.STICKER,
    ];
  }
}
