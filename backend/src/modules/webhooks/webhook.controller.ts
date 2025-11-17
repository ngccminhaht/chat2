import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ZaloWebhookService } from './zalo/zalo-webhook.service';
import { ZaloWebhookDto } from './zalo/dto/zalo-webhook.dto';
import { WebhookPublisherService } from './webhook-publisher.service';

/**
 * Unified webhook controller for all platforms
 * Handles webhooks at /api/webhook/{platform}
 *
 * Architecture: Webhooks immediately publish to Kafka and return 200.
 * Kafka consumers handle all processing (DB save, WebSocket notifications).
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookPublisher: WebhookPublisherService,
    private readonly zaloWebhookService: ZaloWebhookService, // For signature verification only
  ) {}

  /**
   * Zalo OA webhook endpoint
   * POST /api/webhook/zalo
   *
   * Receives webhook events from Zalo Official Account.
   * Publishes to Kafka immediately and returns 200.
   */
  @Post('zalo')
  @HttpCode(200)
  async handleZaloWebhook(
    @Body() payload: ZaloWebhookDto,
    @Headers('x-zalo-signature') signature: string,
    @Headers() headers: Record<string, string>,
  ): Promise<{ success: boolean }> {
    this.logger.log('='.repeat(80));
    this.logger.log('📥 ZALO WEBHOOK RECEIVED');
    this.logger.log('='.repeat(80));
    this.logger.log('Headers:', JSON.stringify({
      'x-zalo-signature': signature,
      'content-type': headers['content-type'],
      'user-agent': headers['user-agent'],
    }, null, 2));
    this.logger.log('-'.repeat(80));
    this.logger.log('Full Payload:', JSON.stringify(payload, null, 2));
    this.logger.log('-'.repeat(80));
    this.logger.log('Event Summary:', {
      event: payload.event_name,
      oaId: payload.app_id,
      userId: payload.user_id_by_app,
      timestamp: payload.timestamp,
      hasMessage: !!payload.message,
      hasSender: !!payload.sender,
      hasRecipient: !!payload.recipient,
    });
    this.logger.log('='.repeat(80));

    // Verify signature (if provided)
    if (signature) {
      const appSecret = process.env.ZALO_APP_SECRET;
      if (!appSecret) {
        this.logger.error('ZALO_APP_SECRET not configured');
        return { success: true }; // Return 200 to avoid retries
      }

      const isValid = this.zaloWebhookService.verifySignature(
        JSON.stringify(payload),
        signature,
        appSecret,
      );

      if (!isValid) {
        this.logger.warn('Invalid Zalo webhook signature - processing anyway');
        // Still process but log warning - signature may be optional
      }
    }

    // Publish to Kafka and return immediately
    this.webhookPublisher
      .publishWebhookEvent('zalo', payload, signature)
      .catch((error) => {
        this.logger.error('Failed to publish Zalo webhook to Kafka:', error);
      });

    // Return 200 immediately to Zalo to acknowledge receipt
    return { success: true };
  }

  /**
   * Facebook Messenger webhook endpoint
   * POST /api/webhook/facebook
   */
  @Post('facebook')
  @HttpCode(200)
  async handleFacebookWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ success: boolean }> {
    this.logger.log('Received Facebook webhook:', payload);

    // TODO: Implement Facebook webhook handling
    // this.facebookWebhookService.processWebhook(payload);

    return { success: true };
  }

  /**
   * TikTok Shop webhook endpoint
   * POST /api/webhook/tiktok
   */
  @Post('tiktok')
  @HttpCode(200)
  async handleTikTokWebhook(
    @Body() payload: any,
    @Headers('x-tiktok-signature') signature: string,
  ): Promise<{ success: boolean }> {
    this.logger.log('Received TikTok webhook:', payload);

    // TODO: Implement TikTok webhook handling

    return { success: true };
  }

  /**
   * Shopee webhook endpoint
   * POST /api/webhook/shopee
   */
  @Post('shopee')
  @HttpCode(200)
  async handleShopeeWebhook(
    @Body() payload: any,
    @Headers('authorization') authorization: string,
  ): Promise<{ success: boolean }> {
    this.logger.log('Received Shopee webhook:', payload);

    // TODO: Implement Shopee webhook handling

    return { success: true };
  }
}
