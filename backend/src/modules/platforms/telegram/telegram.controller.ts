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
    this.logger.log(`📥 Telegram Webhook received`);
    this.logger.log(`  Bot token: ***${botToken.slice(-6)}`);
    this.logger.log(`  Payload: ${JSON.stringify(payload)}`);
    this.logger.log(`  Secret token present: ${!!secretToken}`);

    // Step 1: Find connection by bot token
    this.logger.log(`  Step 1: Finding connection for bot...`);
    const connection = await this.telegramService.findConnectionByBotToken(botToken);
    if (!connection) {
      this.logger.warn(`❌ Bot token not found in database`);
      throw new BadRequestException('Invalid bot token');
    }
    this.logger.log(`  ✅ Found connection: ${connection._id}`);

    // Step 2: Verify webhook secret
    this.logger.log(`  Step 2: Verifying webhook secret...`);
    const storedSecret = (connection.credentials as any).webhookSecret;
    if (!storedSecret || !this.telegramService.verifySignature(secretToken, storedSecret)) {
      this.logger.warn(`❌ Invalid webhook secret`);
      this.logger.warn(`  Received: ${secretToken?.substring(0, 10)}...`);
      this.logger.warn(`  Expected: ${storedSecret?.substring(0, 10)}...`);
      throw new BadRequestException('Invalid webhook secret');
    }
    this.logger.log(`  ✅ Webhook secret verified`);

    // Step 3: Publish to Kafka with botId injected
    // Telegram webhook doesn't include bot info, so we inject it from URL
    const botId = botToken.split(':')[0];
    const enrichedPayload = {
      ...payload,
      _botId: botId, // Internal field for adapter to extract
    };

    this.logger.log(`  Step 3: Publishing to Kafka with botId=${botId}...`);
    await this.webhookPublisher.publishWebhookEvent(
      'telegram',
      enrichedPayload,
      secretToken,
    );

    this.logger.log(`✅ Telegram webhook processed and published to Kafka`);
    return { success: true };
  }
}
