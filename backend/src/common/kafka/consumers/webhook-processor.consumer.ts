import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../kafka.config';
import { ZaloWebhookService } from '@/modules/webhooks/zalo-webhook.service';
import { FacebookWebhookService } from '@/modules/webhooks/facebook-webhook.service';
import { ShopeeWebhookService } from '@/modules/webhooks/shopee-webhook.service';
import { ZaloWebhookDto } from '@/modules/webhooks/dto/zalo-webhook.dto';
import { FacebookWebhookDto } from '@/modules/webhooks/dto/facebook-webhook.dto';
import { ShopeeWebhookDto } from '@/modules/webhooks/dto/shopee-webhook.dto';

/**
 * Webhook event from Kafka
 */
interface WebhookRawEvent {
  platform: string;
  payload: any;
  signature?: string;
  timestamp: number;
}

/**
 * Webhook Processor Consumer
 * Processes raw webhook events from platform.webhooks.raw topic
 *
 * Architecture:
 * 1. Webhook arrives at controller → publishes to Kafka → returns 200
 * 2. This consumer processes webhook → normalizes → saves to DB → publishes to websocket.notifications
 * 3. WebSocket bridge consumes notifications → emits to Socket.IO clients
 */
@Controller()
export class WebhookProcessorConsumer {
  private readonly logger = new Logger(WebhookProcessorConsumer.name);

  constructor(
    private zaloWebhookService: ZaloWebhookService,
    private facebookWebhookService: FacebookWebhookService,
    private shopeeWebhookService: ShopeeWebhookService,
  ) {}

  @MessagePattern(KAFKA_TOPICS.WEBHOOKS_RAW)
  async handleWebhook(@Payload() event: WebhookRawEvent): Promise<void> {
    this.logger.log(`Processing ${event.platform} webhook from Kafka`);

    try {
      switch (event.platform) {
        case 'zalo':
          await this.processZaloWebhook(event);
          break;

        case 'facebook':
          await this.processFacebookWebhook(event);
          break;

        case 'shopee':
          await this.processShopeeWebhook(event);
          break;

        default:
          this.logger.warn(`Unknown platform: ${event.platform}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${event.platform} webhook:`, error);
      // Don't throw - continue processing other messages
    }
  }

  /**
   * Process Zalo webhook
   */
  private async processZaloWebhook(event: WebhookRawEvent): Promise<void> {
    const payload: ZaloWebhookDto = event.payload;
    await this.zaloWebhookService.processWebhook(payload);
    this.logger.log(`✅ Processed Zalo webhook: ${payload.event_name}`);
  }

  /**
   * Process Facebook webhook
   */
  private async processFacebookWebhook(event: WebhookRawEvent): Promise<void> {
    const payload: FacebookWebhookDto = event.payload;
    await this.facebookWebhookService.processWebhook(payload);
    this.logger.log(`✅ Processed Facebook webhook`);
  }

  /**
   * Process Shopee webhook
   */
  private async processShopeeWebhook(event: WebhookRawEvent): Promise<void> {
    const payload: ShopeeWebhookDto = event.payload;
    await this.shopeeWebhookService.processWebhook(payload);
    this.logger.log(`✅ Processed Shopee webhook`);
  }
}
