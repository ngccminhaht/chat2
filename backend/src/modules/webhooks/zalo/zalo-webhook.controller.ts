import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ZaloWebhookService } from './zalo-webhook.service';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';

@Controller('webhooks/zalo')
export class ZaloWebhookController {
  private readonly logger = new Logger(ZaloWebhookController.name);

  constructor(private readonly zaloWebhookService: ZaloWebhookService) {}

  /**
   * Webhook endpoint for Zalo OA
   * POST /api/webhooks/zalo/:platformConnectionId
   */
  @Post(':platformConnectionId')
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: ZaloWebhookDto,
    @Headers('x-zalo-signature') signature: string,
    @Query('platformConnectionId') platformConnectionId: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Received Zalo webhook for connection ${platformConnectionId}`,
    );

    // Verify signature (if provided)
    if (signature) {
      const appSecret = process.env.ZALO_APP_SECRET;
      if (!appSecret) {
        throw new BadRequestException('Zalo app secret not configured');
      }

      const isValid = this.zaloWebhookService.verifySignature(
        JSON.stringify(payload),
        signature,
        appSecret,
      );

      if (!isValid) {
        this.logger.warn('Invalid Zalo webhook signature');
        throw new BadRequestException('Invalid signature');
      }
    }

    // Process webhook asynchronously
    this.zaloWebhookService
      .processWebhook(payload, platformConnectionId)
      .catch((error) => {
        this.logger.error('Error processing Zalo webhook:', error);
      });

    // Return 200 immediately to Zalo
    return { success: true };
  }
}
