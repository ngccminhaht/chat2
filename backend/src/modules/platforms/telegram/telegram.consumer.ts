import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@/infra/kafka/kafka.config';
import { WebhookProcessorService } from '../core/services/webhook-processor.service';
import { Platform } from '@/common/constants';

/**
 * Telegram Kafka Consumer
 *
 * Consumes webhook events from Kafka and processes them via WebhookProcessorService.
 * Topic: platform.telegram.webhooks
 */
@Controller()
export class TelegramConsumer {
  private readonly logger = new Logger(TelegramConsumer.name);

  constructor(private readonly webhookProcessor: WebhookProcessorService) {}

  @MessagePattern(KAFKA_TOPICS.TELEGRAM_WEBHOOKS)
  async handleWebhook(@Payload() payload: unknown): Promise<void> {
    const tgPayload = payload as any;
    const botId = tgPayload?._botId;
    const updateId = tgPayload?.update_id;
    const messageId = tgPayload?.message?.message_id;
    const chatId = tgPayload?.message?.chat?.id;
    const fromId = tgPayload?.message?.from?.id;
    const text = tgPayload?.message?.text;

    this.logger.log(`📨 ====== TELEGRAM KAFKA CONSUMER ======`);
    this.logger.log(`  Bot ID: ${botId}`);
    this.logger.log(`  Update ID: ${updateId}`);
    this.logger.log(`  Message ID: ${messageId}`);
    this.logger.log(`  Chat ID: ${chatId}`);
    this.logger.log(`  From ID: ${fromId}`);
    this.logger.log(`  Text: ${text?.substring(0, 50)}${text?.length > 50 ? '...' : ''}`);
    this.logger.log(`  Full payload: ${JSON.stringify(tgPayload)}`);

    try {
      const result = await this.webhookProcessor.process(Platform.TELEGRAM, payload);

      if (result.success) {
        this.logger.log(`✅ Processed ${result.messagesProcessed} messages`);
      } else {
        this.logger.error(`❌ Processing failed:`, result.errors);
      }
    } catch (error) {
      this.logger.error(`❌ Exception in webhook processor:`, error.message);
      this.logger.error(error.stack);
    }
    this.logger.log(`📨 ====== END TELEGRAM KAFKA CONSUMER ======`);
  }
}
