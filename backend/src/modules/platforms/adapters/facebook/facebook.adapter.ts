import { Injectable } from '@nestjs/common';
import { Platform, MessageType } from '@/common/constants';
import { EnvService } from '@/common/env';
import { IPlatformAdapter } from '@/common/platform';
import { FacebookWebhookHandler } from './facebook-webhook.handler';
import { FacebookOAuthHandler } from './facebook-oauth.handler';
import { FacebookSenderHandler } from './facebook-sender.handler';

/**
 * Facebook Platform Adapter
 * Combines webhook, OAuth, and message sender handlers for Facebook/Messenger
 */
@Injectable()
export class FacebookAdapter implements IPlatformAdapter {
  readonly platform = Platform.FACEBOOK;
  readonly displayName = 'Facebook Messenger';

  private readonly appSecret: string;
  private readonly verifyToken: string;

  constructor(
    readonly webhook: FacebookWebhookHandler,
    readonly oauth: FacebookOAuthHandler,
    readonly sender: FacebookSenderHandler,
    private readonly envService: EnvService,
  ) {
    this.appSecret = this.envService.get('FACEBOOK_APP_SECRET');
    this.verifyToken = this.envService.get('FACEBOOK_VERIFY_TOKEN') || 'miagent_verify_token';
  }

  /**
   * Get webhook verify token for Facebook webhook verification (GET request)
   */
  getWebhookVerifyToken(): string {
    return this.verifyToken;
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
    const appId = this.envService.get('FACEBOOK_APP_ID');
    return !!(appId && this.appSecret);
  }

  /**
   * Get supported message types
   */
  getSupportedMessageTypes(): string[] {
    return [
      MessageType.TEXT,
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
      MessageType.FILE,
      MessageType.LOCATION,
    ];
  }
}
