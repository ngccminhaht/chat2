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
    const pages = await this.facebookOAuthService.getPages(
      tokenResponse.access_token,
    );

    if (pages.length === 0) {
      // Redirect to error page - user has no pages
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(
        `${frontendUrl}/platform-connections?status=error&platform=facebook&message=${encodeURIComponent('No Facebook pages found')}`,
      );
    }

    // Save each page as a separate platform connection
    const userId = storedStateData.userId;
    const isSyncMode = storedStateData.syncMode || false;
    let firstPageName = '';

    for (const page of pages) {
      try {
        const connection = await this.facebookOAuthService.savePlatformConnection(
          userId,
          page,
        );

        if (!firstPageName) {
          firstPageName = page.name || 'Facebook Page';
        }

        // Sync conversations in background (don't wait for completion)
        this.facebookOAuthService
          .syncConversations(connection._id.toString())
          .catch((error) => {
            console.error('Failed to sync conversations:', error);
          });
      } catch (error) {
        console.error(`Failed to save page ${page.id}:`, error);
        // Continue with next page even if one fails
      }
    }

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const action = isSyncMode ? 'synced' : 'connected';
    const message = isSyncMode
      ? `Synced ${pages.length} page${pages.length > 1 ? 's' : ''}`
      : `${pages.length} page${pages.length > 1 ? 's' : ''}`;

    return res.redirect(
      `${frontendUrl}/platform-connections?status=success&platform=facebook&action=${action}&account=${encodeURIComponent(message)}`,
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
   * Initiate Facebook pages sync (redirects to OAuth)
   * GET /api/platform-connections/facebook/sync-pages
   * This will redirect user to Facebook OAuth to re-authorize and sync all pages
   */
  @Get('sync-pages')
  @UseGuards(JwtAuthGuard)
  async syncPages(@Request() req: any, @Res() res: Response) {
    const userId = req.user.userId;

    this.logger.log(`User ${userId} initiating Facebook pages sync`);

    // Generate OAuth URL for re-authentication
    const { authUrl, state } = await this.facebookOAuthService.syncPagesForUser(userId);

    // Store state in Redis for callback verification
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
      syncMode: true, // Flag to indicate this is a sync operation
    });

    // Redirect to Facebook OAuth
    return res.redirect(authUrl);
  }
}
