import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  HttpCode,
  BadRequestException,
  Logger,
  Req,
  Res,
  UseGuards,
  Request as NestRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { FacebookWebhookDto } from './dto/facebook-webhook.dto';
import {
  FacebookAuthUrlDto,
  FacebookAuthorizeDto,
  FacebookCallbackDto,
  FacebookPendingPagesDto,
  FacebookSavePagesDto,
} from './dto/oauth.dto';
import { FacebookService } from './facebook.service';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';
import { OAuthStateService } from '@/modules/connections/oauth-state.service';
import { EnvService } from '@/common/env';
import { OrganizationsService } from '@/modules/organizations/organizations.service';

interface RawBodyRequest<T> extends Request {
  rawBody?: Buffer;
}

/**
 * Facebook Controller
 *
 * Handles HTTP endpoints for Facebook webhooks:
 * - GET /api/facebook/webhook (webhook verification)
 * - POST /api/facebook/webhook (webhook receiving & publishing to Kafka)
 */
@Controller('facebook')
export class FacebookController {
  private readonly logger = new Logger(FacebookController.name);

  constructor(
    private readonly facebookService: FacebookService,
    private readonly webhookPublisher: WebhookPublisherService,
    private readonly envService: EnvService,
    private readonly oauthStateService: OAuthStateService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /**
   * GET /api/facebook/webhook
   * Facebook webhook verification - must echo challenge parameter
   */
  @Get('webhook')
  @HttpCode(200)
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
  ): Promise<string> {
    this.logger.log('📋 Facebook webhook verification');

    const expectedToken = this.envService.get('FACEBOOK_VERIFY_TOKEN');
    if (!expectedToken) {
      throw new BadRequestException('FACEBOOK_VERIFY_TOKEN not configured');
    }

    if (mode !== 'subscribe' || verifyToken !== expectedToken) {
      throw new BadRequestException('Invalid verification');
    }

    this.logger.log('✅ Verified');
    return challenge;
  }

  /**
   * POST /api/facebook/webhook
   * Receive messages from Facebook Messenger
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: FacebookWebhookDto,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ success: boolean }> {
    const pageId = payload.entry?.[0]?.id;
    const eventCount =
      (payload.entry?.[0]?.messaging?.length || 0) + (payload.entry?.[0]?.changes?.length || 0);
    this.logger.log(`📥 Facebook: Page ${pageId} | ${eventCount} events`);

    // Verify signature
    if (signature) {
      const appSecret = this.envService.get('FACEBOOK_APP_SECRET');
      if (appSecret) {
        const rawBody = req.rawBody?.toString('utf8') || JSON.stringify(payload);
        const isValid = this.facebookService.verifySignature(rawBody, signature, appSecret);

        if (!isValid) {
          this.logger.warn('⚠️  Invalid signature');
        }
      }
    }

    // Publish to Kafka for async processing
    this.webhookPublisher.publishWebhookEvent('facebook', payload, signature).catch((error) => {
      this.logger.error('❌ Kafka publish failed:', error);
    });

    return { success: true };
  }

  // ==================== OAuth Routes ====================

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/facebook/authorize?userId=xxx&organizationId=xxx
   */
  @Get('authorize')
  async authorize(@Query() dto: FacebookAuthorizeDto, @Res() res: Response) {
    this.logger.log('🔐 User authorizing Facebook:', { userId: dto.userId, organizationId: dto.organizationId });

    const { url, state } = this.facebookService.getAuthorizationUrl(dto.state);

    await this.oauthStateService.storeState(state, {
      state,
      userId: dto.userId,
      organizationId: dto.organizationId,
      createdAt: Date.now(),
    });

    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Facebook
   * GET /api/facebook/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async callback(@Query() dto: FacebookCallbackDto, @Res() res: Response) {
    this.logger.log('🔙 Facebook callback received:', {
      code: dto.code?.substring(0, 20) + '...',
      state: dto.state,
    });

    const storedStateData = await this.oauthStateService.getAndDeleteState(dto.state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    const organizationId = storedStateData.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for Facebook connection');
    }

    this.logger.log('✅ State verified, exchanging code for token');

    const tokenResponse = await this.facebookService.exchangeCodeForToken(dto.code);
    const pages = await this.facebookService.getPages(tokenResponse.access_token);

    const org = await this.organizationsService.findById(organizationId);
    const frontendUrl = this.envService.get('FRONTEND_URL');

    if (pages.length === 0) {
      return res.redirect(
        `${frontendUrl}/organizations/${org.slug}/channels?platform=facebook&error=${encodeURIComponent('No Facebook pages found')}`,
      );
    }

    const userId = storedStateData.userId;

    const connections = [];
    for (const page of pages) {
      try {
        const connection = await this.facebookService.savePlatformConnection(userId, organizationId, page);

        connections.push({
          id: connection._id,
          platform: connection.platform,
          accountName: connection.platformAccountName,
          status: connection.status,
        });

        this.facebookService
          .syncConversations(connection._id.toString())
          .catch((error) => {
            this.logger.error('Failed to sync conversations:', error);
          });
      } catch (error) {
        this.logger.error(`Failed to save page ${page.id}:`, error);
      }
    }

    // Redirect with first connection ID for highlight
    const newId = connections.length > 0 ? connections[0].id : '';
    return res.redirect(
      `${frontendUrl}/organizations/${org.slug}/channels?platform=facebook&new=${newId}`,
    );
  }

  /**
   * Get authorization URL as JSON
   * GET /api/facebook/auth-url?organizationId=xxx
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(@Query() dto: FacebookAuthUrlDto, @NestRequest() req: any) {
    const userId = req.user.userId;
    const { url, state } = this.facebookService.getAuthorizationUrl(dto.state);

    this.logger.log('📝 Generating auth URL and storing state for user:', {
      userId,
      organizationId: dto.organizationId,
      state,
    });

    await this.oauthStateService.storeState(state, {
      state,
      userId,
      organizationId: dto.organizationId,
      createdAt: Date.now(),
    });

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Complete OAuth with code
   * GET /api/facebook/complete?code=xxx&state=xxx
   */
  @Get('complete')
  @UseGuards(JwtAuthGuard)
  async completeOAuth(@Query() dto: FacebookCallbackDto, @NestRequest() req: any) {
    const userId = req.user.userId;

    const storedStateData = await this.oauthStateService.getAndDeleteState(dto.state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    const organizationId = storedStateData.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for Facebook connection');
    }

    const tokenResponse = await this.facebookService.exchangeCodeForToken(dto.code);
    const pages = await this.facebookService.getPages(tokenResponse.access_token);

    if (pages.length === 0) {
      throw new BadRequestException('No Facebook pages found');
    }

    const connections = [];

    for (const page of pages) {
      try {
        const connection = await this.facebookService.savePlatformConnection(userId, organizationId, page);

        connections.push({
          id: connection._id,
          platform: connection.platform,
          accountName: connection.platformAccountName,
          status: connection.status,
        });

        this.facebookService
          .syncConversations(connection._id.toString())
          .catch((error) => {
            this.logger.error('Failed to sync conversations:', error);
          });
      } catch (error) {
        this.logger.error(`Failed to save page ${page.id}:`, error);
      }
    }

    return {
      success: true,
      message: `Connected ${connections.length} Facebook page${connections.length > 1 ? 's' : ''}`,
      connections,
    };
  }

  /**
   * Get sync status for user's Facebook pages
   * GET /api/facebook/sync-status
   */
  @Get('sync-status')
  @UseGuards(JwtAuthGuard)
  async getSyncStatus(@NestRequest() req: any) {
    const userId = req.user.userId;
    const status = await this.facebookService.getSyncStatus(userId);

    return {
      success: true,
      ...status,
    };
  }

  /**
   * Get authorization URL for syncing Facebook pages
   * GET /api/facebook/sync-auth-url
   */
  @Get('sync-auth-url')
  @UseGuards(JwtAuthGuard)
  async getSyncAuthUrl(@NestRequest() req: any) {
    const userId = req.user.userId;

    this.logger.log(`Generating sync auth URL for user ${userId}`);

    const { authUrl, state } = await this.facebookService.syncPagesForUser(userId);

    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
      syncMode: true,
    });

    return {
      authUrl,
      state,
    };
  }

  /**
   * Get pending pages for selection
   * GET /api/facebook/pending-pages?token=xxx
   */
  @Get('pending-pages')
  @UseGuards(JwtAuthGuard)
  async getPendingPages(@Query() dto: FacebookPendingPagesDto, @NestRequest() req: any) {
    const userId = req.user.userId;

    const pendingData = await this.oauthStateService.getState(`pages_${dto.token}`);

    if (!pendingData) {
      throw new BadRequestException('Selection token expired or invalid');
    }

    if (pendingData.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    return {
      success: true,
      pages: pendingData.pages,
      isSyncMode: pendingData.isSyncMode || false,
    };
  }

  /**
   * Save selected pages
   * GET /api/facebook/save-pages
   */
  @Get('save-pages')
  @UseGuards(JwtAuthGuard)
  async saveSelectedPages(@Query() dto: FacebookSavePagesDto, @NestRequest() req: any) {
    const userId = req.user.userId;
    const selectedPageIds = dto.pageIds.split(',');

    const pendingData = await this.oauthStateService.getAndDeleteState(`pages_${dto.token}`);

    if (!pendingData) {
      throw new BadRequestException('Selection token expired or invalid');
    }

    if (pendingData.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    const organizationId = pendingData.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for Facebook connection');
    }

    const allPages = pendingData.pages;
    const connections = [];

    for (const pageId of selectedPageIds) {
      const page = allPages.find((p: any) => p.id === pageId);
      if (page) {
        try {
          const connection = await this.facebookService.savePlatformConnection(userId, organizationId, page);

          connections.push({
            id: connection._id,
            platform: connection.platform,
            accountName: connection.platformAccountName,
            status: connection.status,
          });

          this.facebookService
            .syncConversations(connection._id.toString())
            .catch((error) => {
              this.logger.error('Failed to sync conversations:', error);
            });
        } catch (error) {
          this.logger.error(`Failed to save page ${page.id}:`, error);
        }
      }
    }

    return {
      success: true,
      message: `Connected ${connections.length} Facebook page${connections.length > 1 ? 's' : ''}`,
      connections,
    };
  }
}
