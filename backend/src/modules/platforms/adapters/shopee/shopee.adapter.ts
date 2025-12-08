import { Injectable } from '@nestjs/common';
import { Platform, MessageType } from '@/common/constants';
import { EnvService } from '@/common/env';
import { IPlatformAdapter } from '@/common/platform';
import { ShopeeWebhookHandler } from './shopee-webhook.handler';
import { ShopeeOAuthHandler } from './shopee-oauth.handler';
import { ShopeeSenderHandler } from './shopee-sender.handler';

/**
 * Shopee Platform Adapter
 * Combines webhook, OAuth, and message sender handlers for Shopee Chat
 */
@Injectable()
export class ShopeeAdapter implements IPlatformAdapter {
  readonly platform = Platform.SHOPEE;
  readonly displayName = 'Shopee Chat';

  private readonly partnerKey: string;

  constructor(
    readonly webhook: ShopeeWebhookHandler,
    readonly oauth: ShopeeOAuthHandler,
    readonly sender: ShopeeSenderHandler,
    private readonly envService: EnvService,
  ) {
    this.partnerKey = this.envService.get('SHOPEE_PARTNER_KEY');
  }

  /**
   * Shopee doesn't use webhook verification token like Facebook
   */
  getWebhookVerifyToken(): string | undefined {
    return undefined;
  }

  /**
   * Get partner key for signature verification
   */
  getAppSecret(): string {
    return this.partnerKey;
  }

  /**
   * Check if adapter is properly configured
   */
  isConfigured(): boolean {
    const partnerId = this.envService.get('SHOPEE_PARTNER_ID');
    return !!(partnerId && this.partnerKey);
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
