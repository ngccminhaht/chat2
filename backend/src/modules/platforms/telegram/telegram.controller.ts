import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Public } from '@/common/decorators';
import { TelegramService } from './telegram.service';
import { ConnectTelegramDto } from './dto/connect-telegram.dto';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly webhookPublisher: WebhookPublisherService,
  ) {}

  /**
   * Connect a Telegram bot
   * POST /api/telegram/connect
   */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async connectBot(@Body() dto: ConnectTelegramDto) {
    this.logger.log(`Connect bot request: org=${dto.organizationId}`);

    const connection = await this.telegramService.connectBot(dto);

    return {
      id: connection.id,
      platform: connection.platform,
      platformAccountId: connection.platformAccountId,
      platformAccountName: connection.platformAccountName,
      status: connection.status,
    };
  }

  /**
   * Receive webhook updates from Telegram
   * POST /telegram/webhook/:botToken
   * This endpoint is called by Telegram when messages are sent to the bot
   */
  @Post('webhook/:botToken')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('botToken') botToken: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
    @Body() payload: any,
  ): Promise<{ success: boolean }> {
    this.logger.log(`📥 Telegram Webhook: bot=***${botToken.slice(-6)}`);

    // Step 1: Find connection by bot token
    const connection = await this.telegramService.findConnectionByBotToken(botToken);
    if (!connection) {
      this.logger.warn(`❌ Bot token not found`);
      throw new BadRequestException('Invalid bot token');
    }

    // Step 2: Verify webhook secret
    const storedSecret = (connection.credentials as any).webhookSecret;
    if (!storedSecret || !this.telegramService.verifySignature(secretToken, storedSecret)) {
      this.logger.warn(`❌ Invalid webhook secret`);
      throw new BadRequestException('Invalid webhook secret');
    }

    // Step 3: Publish to Kafka
    await this.webhookPublisher.publishWebhookEvent(
      'telegram',
      payload,
      secretToken,
    );

    this.logger.log(`✅ Webhook published to Kafka`);
    return { success: true };
  }
}
