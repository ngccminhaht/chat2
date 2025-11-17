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

/**
 * Unified webhook controller for all platforms
 * Handles webhooks at /api/webhook/{platform}
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly zaloWebhookService: ZaloWebhookService,
    // Add other platform services here as needed
    // private readonly facebookWebhookService: FacebookWebhookService,
  ) {}

  /**
   * Zalo OA webhook endpoint
   * POST /api/webhook/zalo
   *
   * Receives webhook events from Zalo Official Account.
   * Automatically finds the platform connection based on OA ID from payload.
   */
  @Post('zalo')
  @HttpCode(200)
  async handleZaloWebhook(
    @Body() payload: ZaloWebhookDto,
    @Headers('x-zalo-signature') signature: string,
  ): Promise<{ success: boolean }> {
    this.logger.log('Received Zalo webhook - Full payload:', JSON.stringify(payload, null, 2));
    this.logger.log('Received Zalo webhook event:', {
      event: payload.event_name,
      oaId: payload.app_id,
      userId: payload.user_id_by_app,
    });

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

    // Process webhook asynchronously
    this.zaloWebhookService
      .processWebhook(payload)
      .catch((error) => {
        this.logger.error('Error processing Zalo webhook:', error);
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
