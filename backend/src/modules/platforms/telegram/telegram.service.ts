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

    // Step 4: Set webhook URL
    const webhookUrl = this.getWebhookUrl(botToken);
    await this.setWebhook(botToken, webhookUrl, webhookSecret);

    this.logger.log(`Webhook set successfully: ${webhookUrl}`);

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
        throw new BadRequestException(
          `Failed to set webhook: ${response.data.description || 'Unknown error'}`,
        );
      }

      this.logger.log('Webhook set successfully');
    } catch (error) {
      this.logger.error('Failed to set webhook:', error.message);
      throw new BadRequestException(`Failed to set webhook: ${error.message}`);
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
   * Format: https://your-domain.com/api/webhooks/telegram/<botToken>
   */
  private getWebhookUrl(botToken: string): string {
    const baseUrl = this.envService.get('API_BASE_URL');
    // Use bot token as unique identifier in webhook URL
    // This allows multiple bots without needing connectionId upfront
    return `${baseUrl}/webhooks/telegram/${botToken}`;
  }

  /**
   * Verify webhook signature
   * Telegram sends secret_token in X-Telegram-Bot-Api-Secret-Token header
   */
  verifySignature(headerToken: string, storedSecret: string): boolean {
    return headerToken === storedSecret;
  }
}
