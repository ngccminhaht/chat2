import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Query,
  RawBodyRequest,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { Platform, KAFKA_TOPICS } from '@/common/constants';
import { PlatformRegistryService } from '@/common/platform';
import { RawWebhookPayload } from '@/common/platform/types/kafka-events.type';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';

/**
 * Unified Webhook Controller
 * Handles webhooks from all platforms through a single endpoint per platform
 *
 * Routes:
 * - GET  /api/platforms/:platform/webhook - Webhook verification (Facebook, etc.)
 * - POST /api/platforms/:platform/webhook - Receive webhook events
 */
@Controller('platforms')
export class UnifiedWebhookController {
  private readonly logger = new Logger(UnifiedWebhookController.name);

  constructor(
    private readonly platformRegistry: PlatformRegistryService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Handle webhook verification (GET request)
   * Used by Facebook and similar platforms to verify webhook URL
   */
  @Get(':platform/webhook')
  async handleVerification(
    @Param('platform') platform: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    const platformEnum = this.parsePlatform(platform);

    this.logger.log(`Webhook verification request for ${platform}`);

    // Get adapter and verify token
    const adapter = this.platformRegistry.getAdapter(platformEnum);
    const expectedToken = adapter.getWebhookVerifyToken?.();

    // If platform doesn't use webhook verification (like Shopee), return 404
    if (!expectedToken) {
      this.logger.warn(`Platform ${platform} does not support webhook verification`);
      throw new NotFoundException(`Platform ${platform} does not support webhook verification`);
    }

    // Facebook-style verification
    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log(`Webhook verified for ${platform}`);
      return challenge;
    }

    this.logger.warn(`Webhook verification failed for ${platform}: token mismatch`);
    throw new BadRequestException('Webhook verification failed');
  }

  /**
   * Handle incoming webhook events (POST request)
   * Verifies signature and publishes to Kafka for async processing
   */
  @Post(':platform/webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('platform') platform: string,
    @Headers('x-hub-signature-256') fbSignature: string, // Facebook
    @Headers('x-zalooa-signature') zaloSignature: string, // Zalo OA
    @Headers('authorization') shopeeAuth: string, // Shopee
    @Headers('x-tiktok-signature') tiktokSignature: string, // TikTok
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const platformEnum = this.parsePlatform(platform);

    this.logger.debug(`Received webhook from ${platform}`);

    // Get the appropriate signature based on platform
    const signature = this.getSignatureForPlatform(platformEnum, {
      fbSignature,
      zaloSignature,
      shopeeAuth,
      tiktokSignature,
    });

    // Get adapter
    const adapter = this.platformRegistry.getAdapter(platformEnum);
    const secret = adapter.getAppSecret();

    // Verify signature
    // Use raw body for accurate signature verification
    const rawBody = req.rawBody || JSON.stringify(body);
    const isValid = adapter.webhook.verifySignature(rawBody, signature, secret);

    if (!isValid) {
      this.logger.warn(`Invalid webhook signature for ${platform}`);
      // Return 200 to prevent platform from retrying (but log the issue)
      // Some platforms will keep retrying on non-200 responses
      return { received: true };
    }

    // Extract platform account ID from webhook
    const events = adapter.webhook.parseWebhook(body);

    if (events.length === 0) {
      this.logger.debug(`No events parsed from ${platform} webhook`);
      return { received: true };
    }

    // Get platform account ID from first event (all events in a webhook are for same account)
    const platformAccountId = events[0].platformAccountId;

    // Publish to Kafka for async processing
    const payload: RawWebhookPayload = {
      platform: platformEnum,
      platformAccountId,
      signature,
      timestamp: Date.now(),
      data: body,
    };

    try {
      await this.kafkaProducer.publish(KAFKA_TOPICS.WEBHOOKS_RAW, {
        key: `${platformEnum}:${platformAccountId}`,
        value: payload,
      });

      this.logger.debug(
        `Published webhook to Kafka for ${platform}:${platformAccountId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to publish webhook to Kafka: ${error.message}`);
      // Still return success to platform to prevent retries
      // The webhook data can be recovered from logs if needed
    }

    return { received: true };
  }

  /**
   * Parse platform string to Platform enum
   */
  private parsePlatform(platform: string): Platform {
    const normalizedPlatform = platform.toLowerCase();

    switch (normalizedPlatform) {
      case 'facebook':
      case 'fb':
        return Platform.FACEBOOK;
      case 'zalo':
        return Platform.ZALO;
      case 'shopee':
        return Platform.SHOPEE;
      case 'tiktok':
        return Platform.TIKTOK;
      default:
        throw new BadRequestException(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Get signature header based on platform
   */
  private getSignatureForPlatform(
    platform: Platform,
    headers: {
      fbSignature?: string;
      zaloSignature?: string;
      shopeeAuth?: string;
      tiktokSignature?: string;
    },
  ): string {
    switch (platform) {
      case Platform.FACEBOOK:
        return headers.fbSignature || '';
      case Platform.ZALO:
        return headers.zaloSignature || '';
      case Platform.SHOPEE:
        return headers.shopeeAuth || '';
      case Platform.TIKTOK:
        return headers.tiktokSignature || '';
      default:
        return '';
    }
  }
}
