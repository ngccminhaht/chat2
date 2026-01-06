import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  HttpCode,
  Logger,
  Res,
  UseGuards,
  Request as NestRequest,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '@/common/decorators';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';
import { ZaloAuthUrlDto, ZaloAuthorizeDto, ZaloCallbackDto } from './dto/oauth.dto';
import { ZaloService } from './zalo.service';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';
import { OAuthStateService } from '@/modules/connections/oauth-state.service';
import { EnvService } from '@/common/env';
import { OrganizationsService } from '@/modules/organizations/organizations.service';

/**
 * Zalo Controller
 *
 * Handles HTTP endpoints for Zalo OA webhooks:
 * - POST /api/zalo/webhook (webhook receiving & publishing to Kafka)
 */
@Controller('zalo')
export class ZaloController {
  private readonly logger = new Logger(ZaloController.name);

  constructor(
    private readonly zaloService: ZaloService,
    private readonly webhookPublisher: WebhookPublisherService,
    private readonly envService: EnvService,
    private readonly oauthStateService: OAuthStateService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /**
   * POST /api/zalo/webhook
   * Receive webhook events from Zalo Official Account
   */
  @Post('webhook')
  @Public()
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: ZaloWebhookDto,
    @Headers('x-zalo-signature') signature: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `📥 Zalo: ${payload.event_name} | OA: ${payload.recipient?.id} | Sender: ${payload.sender?.id}`
    );

    // Verify signature
    if (signature) {
      const appSecret = this.envService.get('ZALO_APP_SECRET');
      if (appSecret) {
        const isValid = this.zaloService.verifySignature(
          JSON.stringify(payload),
          signature,
          appSecret,
        );

        if (!isValid) {
          this.logger.warn('⚠️  Invalid signature');
        }
      }
    }

    // Publish to Kafka for async processing
    this.webhookPublisher.publishWebhookEvent('zalo', payload, signature).catch((error) => {
      this.logger.error('❌ Kafka publish failed:', error);
    });

    return { success: true };
  }

  // ==================== OAuth Routes ====================

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/zalo/authorize?userId=xxx&organizationId=xxx
   */
  @Get('authorize')
  async authorize(@Query() dto: ZaloAuthorizeDto, @Res() res: Response) {
    this.logger.log('🔐 User authorizing Zalo:', { userId: dto.userId, organizationId: dto.organizationId });

    const { url, codeVerifier, state } = this.zaloService.getAuthorizationUrl(dto.state);

    await this.oauthStateService.storeState(state, {
      state,
      userId: dto.userId,
      organizationId: dto.organizationId,
      codeVerifier,
      createdAt: Date.now(),
    });

    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Zalo
   * GET /api/zalo/callback?code=xxx&state=xxx&oa_id=xxx
   */
  @Get('callback')
  async callback(@Query() dto: ZaloCallbackDto, @Res() res: Response) {
    this.logger.log('🔙 Zalo callback received:', {
      code: dto.code?.substring(0, 20) + '...',
      state: dto.state,
      oaId: dto.oa_id,
    });

    const storedStateData = await this.oauthStateService.getAndDeleteState(dto.state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    const userId = storedStateData.userId;
    const organizationId = storedStateData.organizationId;
    const codeVerifier = storedStateData.codeVerifier;

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for Zalo connection');
    }

    const tokenResponse = await this.zaloService.exchangeCodeForToken(dto.code, codeVerifier, dto.oa_id);
    const oaInfo = await this.zaloService.getOAInfo(tokenResponse.access_token);

    const connection = await this.zaloService.savePlatformConnection(userId, organizationId, tokenResponse, oaInfo);

    this.zaloService
      .syncConversations(connection._id.toString())
      .catch((error) => {
        this.logger.error('Failed to sync conversations:', error);
      });

    const org = await this.organizationsService.findById(organizationId);
    const frontendUrl = this.envService.get('FRONTEND_URL');
    return res.redirect(
      `${frontendUrl}/organizations/${org.slug}/channels?platform=zalo&new=${connection._id}`,
    );
  }

  /**
   * Get authorization URL as JSON
   * GET /api/zalo/auth-url?organizationId=xxx
   */
  @Get('auth-url')
  
  async getAuthUrl(@Query() dto: ZaloAuthUrlDto, @NestRequest() req: any) {
    const userId = req.user.userId;
    const { url, codeVerifier, state } = this.zaloService.getAuthorizationUrl(dto.state);

    await this.oauthStateService.storeState(state, {
      state,
      userId,
      organizationId: dto.organizationId,
      codeVerifier,
      createdAt: Date.now(),
    });

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Complete OAuth with code
   * GET /api/zalo/complete?code=xxx&state=xxx&oa_id=xxx
   */
  @Get('complete')
  
  async completeOAuth(@Query() dto: ZaloCallbackDto, @NestRequest() req: any) {
    const userId = req.user.userId;

    const storedStateData = await this.oauthStateService.getAndDeleteState(dto.state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    const organizationId = storedStateData.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for Zalo connection');
    }

    const codeVerifier = dto.code_verifier || storedStateData.codeVerifier;

    const tokenResponse = await this.zaloService.exchangeCodeForToken(
      dto.code,
      codeVerifier,
      dto.oa_id,
    );
    const oaInfo = await this.zaloService.getOAInfo(tokenResponse.access_token);

    const connection = await this.zaloService.savePlatformConnection(userId, organizationId, tokenResponse, oaInfo);

    this.zaloService
      .syncConversations(connection._id.toString())
      .catch((error) => {
        this.logger.error('Failed to sync conversations:', error);
      });

    return {
      success: true,
      message: `Connected Zalo OA: ${oaInfo.name}`,
      connection: {
        id: connection._id,
        platform: connection.platform,
        accountName: connection.platformAccountName,
        status: connection.status,
      },
    };
  }
}
