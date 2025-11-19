import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Request,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { FacebookOAuthService } from './facebook-oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { FacebookAuthUrlDto, FacebookCallbackDto } from './dto/facebook-oauth.dto';

@Controller('platform-connections/facebook')
export class FacebookOAuthController {
  private readonly logger = new Logger(FacebookOAuthController.name);

  constructor(
    private readonly facebookOAuthService: FacebookOAuthService,
    private readonly oauthStateService: OAuthStateService,
  ) {}

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/platform-connections/facebook/authorize?userId=xxx
   */
  @Get('authorize')
  async authorize(
    @Query() dto: FacebookAuthUrlDto,
    @Query('userId') userId: string,
    @Res() res: Response,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    console.log('🔐 User authorizing Facebook:', { userId });

    const { url, state } = this.facebookOAuthService.getAuthorizationUrl(
      dto.state,
    );

    // Store state in Redis for callback verification
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
    });

    // Redirect to Facebook OAuth page
    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Facebook
   * GET /api/platform-connections/facebook/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    console.log('🔙 Facebook callback received:', {
      code: code?.substring(0, 20) + '...',
      state,
    });

    if (!code || !state) {
      throw new BadRequestException('Authorization code and state are required');
    }

    // Retrieve stored state data from Redis
    const storedStateData = await this.oauthStateService.getAndDeleteState(
      state,
    );
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    console.log('✅ State verified, exchanging code for token');

    // Verify state matches
    if (state !== storedStateData.state) {
      throw new BadRequestException('Invalid OAuth state');
    }

    // Exchange code for user access token
    const tokenResponse = await this.facebookOAuthService.exchangeCodeForToken(
      code,
    );

    // Get list of pages the user has access to
    // Note: If user selected pages in Facebook's dialog, only those pages will be returned
    const pages = await this.facebookOAuthService.getPages(
      tokenResponse.access_token,
    );

    if (pages.length === 0) {
      // Redirect to error page - user has no pages
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(
        `${frontendUrl}/connections?status=error&platform=facebook&message=${encodeURIComponent('No Facebook pages found')}`,
      );
    }

    const userId = storedStateData.userId;
    const isSyncMode = storedStateData.syncMode || false;

    // Automatically save all pages (user already selected them on Facebook's side)
    const connections = [];
    for (const page of pages) {
      try {
        const connection = await this.facebookOAuthService.savePlatformConnection(
          userId,
          page,
        );

        connections.push({
          id: connection._id,
          platform: connection.platform,
          accountName: connection.platformAccountName,
          status: connection.status,
        });

        // Sync conversations in background
        this.facebookOAuthService
          .syncConversations(connection._id.toString())
          .catch((error) => {
            console.error('Failed to sync conversations:', error);
          });
      } catch (error) {
        console.error(`Failed to save page ${page.id}:`, error);
      }
    }

    // Redirect to connections page with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const actionText = isSyncMode ? 'synced' : 'connected';
    return res.redirect(
      `${frontendUrl}/connections?status=success&platform=facebook&account=${connections.length} page${connections.length > 1 ? 's' : ''}&action=${actionText}`,
    );
  }

  /**
   * Alternative: Get authorization URL as JSON (for frontend to handle redirect)
   * GET /api/platform-connections/facebook/auth-url
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(@Query() dto: FacebookAuthUrlDto, @Request() req: any) {
    const userId = req.user.userId;
    const { url, state } = this.facebookOAuthService.getAuthorizationUrl(
      dto.state,
    );

    console.log('📝 Generating auth URL and storing state for user:', {
      userId,
      state,
    });

    // Store state in Redis so callback can verify it
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
    });

    return {
      authUrl: url,
      state, // Return state for frontend to use in redirect
    };
  }

  /**
   * Alternative: Complete OAuth with code (for frontend-initiated flow)
   * GET /api/platform-connections/facebook/complete?code=xxx&state=xxx
   */
  @Get('complete')
  @UseGuards(JwtAuthGuard)
  async completeOAuth(
    @Query() dto: FacebookCallbackDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;

    if (!dto.code || !dto.state) {
      throw new BadRequestException('Authorization code and state are required');
    }

    // Retrieve stored state data from Redis
    const storedStateData = await this.oauthStateService.getAndDeleteState(
      dto.state,
    );
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    // Verify state matches
    if (dto.state !== storedStateData.state) {
      throw new BadRequestException('Invalid OAuth state');
    }

    // Exchange code for token
    const tokenResponse = await this.facebookOAuthService.exchangeCodeForToken(
      dto.code,
    );

    // Get list of pages
    const pages = await this.facebookOAuthService.getPages(
      tokenResponse.access_token,
    );

    if (pages.length === 0) {
      throw new BadRequestException('No Facebook pages found');
    }

    // Save each page as a separate platform connection
    const connections = [];

    for (const page of pages) {
      try {
        const connection = await this.facebookOAuthService.savePlatformConnection(
          userId,
          page,
        );

        connections.push({
          id: connection._id,
          platform: connection.platform,
          accountName: connection.platformAccountName,
          status: connection.status,
        });

        // Sync conversations in background
        this.facebookOAuthService
          .syncConversations(connection._id.toString())
          .catch((error) => {
            console.error('Failed to sync conversations:', error);
          });
      } catch (error) {
        console.error(`Failed to save page ${page.id}:`, error);
        // Continue with next page
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
   * GET /api/platform-connections/facebook/sync-status
   */
  @Get('sync-status')
  @UseGuards(JwtAuthGuard)
  async getSyncStatus(@Request() req: any) {
    const userId = req.user.userId;
    const status = await this.facebookOAuthService.getSyncStatus(userId);

    return {
      success: true,
      ...status,
    };
  }

  /**
   * Get authorization URL for syncing Facebook pages
   * GET /api/platform-connections/facebook/sync-auth-url
   * Returns OAuth URL with sync mode flag
   */
  @Get('sync-auth-url')
  @UseGuards(JwtAuthGuard)
  async getSyncAuthUrl(@Request() req: any) {
    const userId = req.user.userId;

    this.logger.log(`Generating sync auth URL for user ${userId}`);

    // Generate OAuth URL for re-authentication
    const { authUrl, state } = await this.facebookOAuthService.syncPagesForUser(userId);

    // Store state in Redis with sync mode flag
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
      syncMode: true, // Flag to indicate this is a sync operation
    });

    return {
      authUrl,
      state,
    };
  }

  /**
   * Get pending pages for selection
   * GET /api/platform-connections/facebook/pending-pages?token=xxx
   */
  @Get('pending-pages')
  @UseGuards(JwtAuthGuard)
  async getPendingPages(
    @Query('token') token: string,
    @Request() req: any,
  ) {
    if (!token) {
      throw new BadRequestException('Selection token is required');
    }

    const userId = req.user.userId;

    // Retrieve pending pages from Redis (without deleting)
    const pendingData = await this.oauthStateService.getState(
      `pages_${token}`,
    );

    if (!pendingData) {
      throw new BadRequestException('Selection token expired or invalid');
    }

    // Verify user owns this selection
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
   * POST /api/platform-connections/facebook/save-pages
   * Body: { token: string, selectedPageIds: string[] }
   */
  @Get('save-pages')
  @UseGuards(JwtAuthGuard)
  async saveSelectedPages(
    @Query('token') token: string,
    @Query('pageIds') pageIds: string,
    @Request() req: any,
  ) {
    if (!token || !pageIds) {
      throw new BadRequestException('Token and page IDs are required');
    }

    const userId = req.user.userId;
    const selectedPageIds = pageIds.split(',');

    // Retrieve pending pages from Redis
    const pendingData = await this.oauthStateService.getAndDeleteState(
      `pages_${token}`,
    );

    if (!pendingData) {
      throw new BadRequestException('Selection token expired or invalid');
    }

    // Verify user owns this selection
    if (pendingData.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    const allPages = pendingData.pages;
    const connections = [];

    // Save only selected pages
    for (const pageId of selectedPageIds) {
      const page = allPages.find((p: any) => p.id === pageId);
      if (page) {
        try {
          const connection = await this.facebookOAuthService.savePlatformConnection(
            userId,
            page,
          );

          connections.push({
            id: connection._id,
            platform: connection.platform,
            accountName: connection.platformAccountName,
            status: connection.status,
          });

          // Sync conversations in background
          this.facebookOAuthService
            .syncConversations(connection._id.toString())
            .catch((error) => {
              console.error('Failed to sync conversations:', error);
            });
        } catch (error) {
          console.error(`Failed to save page ${page.id}:`, error);
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
