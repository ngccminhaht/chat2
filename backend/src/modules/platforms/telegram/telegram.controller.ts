import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { TelegramService } from './telegram.service';
import { ConnectTelegramDto } from './dto/connect-telegram.dto';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

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
}
