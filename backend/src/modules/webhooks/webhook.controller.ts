import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  Logger,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { ZaloWebhookService } from './zalo-webhook.service';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';
import { ShopeeWebhookService } from './shopee-webhook.service';
import { ShopeeWebhookDto } from './dto/shopee-webhook.dto';
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
    private readonly shopeeWebhookService: ShopeeWebhookService, // For signature verification only
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
      oaId: payload.recipient?.id, // OA ID is recipient.id
      senderId: payload.sender?.id,
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
   * Shopee webhook verification endpoint
   * GET /api/webhook/shopee
   *
   * Shopee sends GET request to verify the callback URL
   */
  @Get('shopee')
  @HttpCode(200)
  async verifyShopeeWebhook(): Promise<{ code: number; message: string }> {
    this.logger.log('📋 Shopee webhook verification (GET) received');
    return { code: 0, message: 'success' };
  }

  /**
   * Shopee webhook endpoint
   * POST /api/webhook/shopee
   *
   * Receives webhook events from Shopee.
   * Publishes to Kafka immediately and returns 200.
   *
   * Shopee Signature Format:
   * Authorization: HMAC-SHA256(full_url + "|" + request_body, partner_key)
   */
  @Post('shopee')
  @HttpCode(200)
  async handleShopeeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: ShopeeWebhookDto,
    @Headers('authorization') authorization: string,
  ): Promise<{ code: number; message: string }> {
    this.logger.log('='.repeat(80));
    this.logger.log('📥 SHOPEE WEBHOOK RECEIVED');
    this.logger.log('='.repeat(80));
    this.logger.log('Full Payload:', JSON.stringify(payload, null, 2));
    this.logger.log('-'.repeat(80));
    this.logger.log('Event Summary:', {
      code: payload.code,
      message: payload.message,
      shopId: payload.shop_id,
      timestamp: payload.timestamp,
      conversationId: payload.data?.conversation_id,
      messageId: payload.data?.message_id,
      messageType: payload.data?.message_type,
      fromId: payload.data?.from_id,
      fromName: payload.data?.from_name,
    });
    this.logger.log('='.repeat(80));

    // Verify signature (Shopee uses Authorization header with HMAC-SHA256)
    if (authorization) {
      const partnerKey = process.env.SHOPEE_PARTNER_KEY;
      if (!partnerKey) {
        this.logger.error('❌ SHOPEE_PARTNER_KEY not configured');
        return { code: 1, message: 'Server configuration error' };
      }

      // Build full URL for signature verification
      const protocol = req.protocol;
      const host = req.get('host');
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      // Get raw body for signature verification
      const rawBody = req.rawBody?.toString('utf8') || JSON.stringify(payload);

      this.logger.log(`Verifying signature...`);
      this.logger.log(`  URL: ${fullUrl}`);
      this.logger.log(`  Authorization: ${authorization?.substring(0, 30)}...`);

      const isValid = this.shopeeWebhookService.verifySignature(
        fullUrl,
        rawBody,
        authorization,
        partnerKey,
      );

      if (!isValid) {
        this.logger.error('❌ Invalid Shopee webhook signature');
        return { code: 1, message: 'Invalid signature' };
      }

      this.logger.log('✅ Webhook signature verified');
    } else {
      this.logger.warn('⚠️ No authorization header - processing anyway (development mode)');
    }

    // Publish to Kafka and return immediately
    this.webhookPublisher
      .publishWebhookEvent('shopee', payload, authorization)
      .catch((error) => {
        this.logger.error('Failed to publish Shopee webhook to Kafka:', error);
      });

    // Return success response to Shopee
    return { code: 0, message: 'success' };
  }
}
