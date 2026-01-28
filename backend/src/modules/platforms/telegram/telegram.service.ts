import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { EnvService } from '@/common/env';
import { Platform, ConnectionStatus } from '@/common/constants';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { ConnectTelegramDto } from './dto/connect-telegram.dto';

interface TelegramGetMeResponse {
  ok: boolean;
  result?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
  };
  description?: string;
}

interface TelegramSetWebhookResponse {
  ok: boolean;
  result?: boolean;
  description?: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly telegramApiBaseUrl = 'https://api.telegram.org';

  constructor(
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    private envService: EnvService,
  ) {}

  /**
   * Connect a Telegram bot to an organization
   * 1. Validate bot token with getMe API
   * 2. Generate webhook secret
   * 3. Set webhook URL with secret
   * 4. Save connection to database
   */
  async connectBot(dto: ConnectTelegramDto): Promise<PlatformConnectionDocument> {
    const { organizationId, botToken } = dto;

    this.logger.log(`Connecting Telegram bot for organization: ${organizationId}`);

    // Step 1: Validate bot token with Telegram getMe API
    const botInfo = await this.validateBotToken(botToken);

    if (!botInfo.is_bot) {
      throw new BadRequestException('Invalid bot token: not a bot account');
    }

    this.logger.log(`Bot validated: @${botInfo.username} (ID: ${botInfo.id})`);

    // Step 2: Check if bot is already connected
    const existingConnection = await this.platformConnectionModel.findOne({
      platform: Platform.TELEGRAM,
      platformAccountId: String(botInfo.id),
    });

    if (existingConnection) {
      throw new BadRequestException(
        `Bot @${botInfo.username} is already connected to another organization`,
      );
    }

    // Step 3: Generate webhook secret (for X-Telegram-Bot-Api-Secret-Token header)
    const webhookSecret = this.generateWebhookSecret();

    // Step 4: Set webhook URL (skip in local development if no public URL)
    const baseUrl = this.envService.get('API_BASE_URL');
    let webhookUrl = '';

    if (baseUrl.startsWith('https://') || baseUrl.startsWith('http://localhost')) {
      webhookUrl = this.getWebhookUrl(botToken);

      try {
        await this.setWebhook(botToken, webhookUrl, webhookSecret);
        this.logger.log(`Webhook set successfully: ${webhookUrl}`);
      } catch (error) {
        // If webhook setup fails, delete the webhook to use polling instead
        this.logger.warn(`Webhook setup failed: ${error.message}. Bot will use polling mode.`);
        await this.deleteWebhook(botToken);
        webhookUrl = ''; // Clear webhook URL to indicate polling mode
      }
    } else {
      this.logger.warn(
        `Skipping webhook setup (requires HTTPS). Bot will use polling mode. API_BASE_URL: ${baseUrl}`,
      );
    }

    // Step 5: Save connection to database
    const connection = new this.platformConnectionModel({
      organizationId,
      platform: Platform.TELEGRAM,
      platformAccountId: String(botInfo.id),
      platformAccountName: botInfo.username || botInfo.first_name,
      status: ConnectionStatus.ACTIVE,
      credentials: {
        botToken,
        webhookSecret,
        botUsername: botInfo.username,
        botName: botInfo.first_name,
      },
      metadata: {
        canJoinGroups: botInfo.can_join_groups,
        canReadAllGroupMessages: botInfo.can_read_all_group_messages,
        supportsInlineQueries: botInfo.supports_inline_queries,
      },
    });

    await connection.save();

    this.logger.log(`Telegram bot connected successfully: ${connection.id}`);

    return connection;
  }

  /**
   * Validate bot token by calling Telegram getMe API
   */
  private async validateBotToken(
    botToken: string,
  ): Promise<TelegramGetMeResponse['result']> {
    try {
      const response = await axios.get<TelegramGetMeResponse>(
        `${this.telegramApiBaseUrl}/bot${botToken}/getMe`,
      );

      if (!response.data.ok || !response.data.result) {
        throw new BadRequestException(
          `Invalid bot token: ${response.data.description || 'Unknown error'}`,
        );
      }

      return response.data.result;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new BadRequestException('Invalid bot token: unauthorized');
      }
      if (error.response?.status === 404) {
        throw new BadRequestException('Invalid bot token: bot not found');
      }
      this.logger.error('Failed to validate bot token:', error.message);
      throw new BadRequestException(
        `Failed to validate bot token: ${error.message}`,
      );
    }
  }

  /**
   * Set webhook URL for bot
   */
  private async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Setting webhook: ${webhookUrl}`);

      const response = await axios.post<TelegramSetWebhookResponse>(
        `${this.telegramApiBaseUrl}/bot${botToken}/setWebhook`,
        {
          url: webhookUrl,
          secret_token: secretToken,
          max_connections: 100,
          drop_pending_updates: true,
          allowed_updates: ['message', 'edited_message', 'channel_post', 'callback_query'],
        },
      );

      if (!response.data.ok) {
        this.logger.error(`Telegram setWebhook failed: ${response.data.description}`);
        throw new BadRequestException(
          `Failed to set webhook: ${response.data.description || 'Unknown error'}`,
        );
      }

      this.logger.log('Webhook set successfully');
    } catch (error) {
      // Log full error details for debugging
      if (error.response) {
        this.logger.error('Telegram API error response:', {
          status: error.response.status,
          data: error.response.data,
        });

        // Extract Telegram's error description
        const telegramError = error.response.data?.description || error.response.data?.message;
        if (telegramError) {
          throw new BadRequestException(`Telegram webhook error: ${telegramError}`);
        }
      }

      this.logger.error('Failed to set webhook:', error.message);
      throw new BadRequestException(`Failed to set webhook: ${error.message}`);
    }
  }

  /**
   * Delete webhook (fallback to polling mode)
   */
  private async deleteWebhook(botToken: string): Promise<void> {
    try {
      await axios.post(
        `${this.telegramApiBaseUrl}/bot${botToken}/deleteWebhook`,
        { drop_pending_updates: true },
      );
      this.logger.log('Webhook deleted, bot will use polling mode');
    } catch (error) {
      this.logger.warn('Failed to delete webhook:', error.message);
    }
  }

  /**
   * Generate random webhook secret (1-256 characters)
   */
  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex'); // 64 characters
  }

  /**
   * Get webhook URL for this bot
   * Format: https://your-domain.com/telegram/webhook/<botToken>
   */
  private getWebhookUrl(botToken: string): string {
    const baseUrl = this.envService.get('API_BASE_URL');

    // Telegram webhooks REQUIRE HTTPS (or localhost for testing with http)
    if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost')) {
      throw new BadRequestException(
        'Telegram webhooks require HTTPS URL. Please set API_BASE_URL to a public HTTPS domain.',
      );
    }

    // Use bot token as unique identifier in webhook URL
    // This allows multiple bots without needing connectionId upfront
    return `${baseUrl}/telegram/webhook/${botToken}`;
  }

  /**
   * Verify webhook signature
   * Telegram sends secret_token in X-Telegram-Bot-Api-Secret-Token header
   */
  verifySignature(headerToken: string, storedSecret: string): boolean {
    return headerToken === storedSecret;
  }

  /**
   * Find connection by bot token
   * Used by webhook handler to identify which bot received the update
   */
  async findConnectionByBotToken(botToken: string): Promise<PlatformConnectionDocument | null> {
    // Extract bot ID from token (format: "123456:ABC-DEF...")
    const botId = botToken.split(':')[0];

    const connection = await this.platformConnectionModel.findOne({
      platform: Platform.TELEGRAM,
      platformAccountId: botId,
      status: ConnectionStatus.ACTIVE,
    });

    return connection;
  }
}
