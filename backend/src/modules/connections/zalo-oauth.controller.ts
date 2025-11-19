import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ZaloOAuthService } from './zalo-oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { ZaloAuthUrlDto, ZaloCallbackDto } from './dto/zalo-oauth.dto';

@Controller('platform-connections/zalo')
export class ZaloOAuthController {
  constructor(
    private readonly zaloOAuthService: ZaloOAuthService,
    private readonly oauthStateService: OAuthStateService,
  ) {}

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/platform-connections/zalo/authorize?userId=xxx
   */
  @Get('authorize')
  async authorize(
    @Query() dto: ZaloAuthUrlDto,
    @Query('userId') userId: string,
    @Res() res: Response,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    console.log('🔐 User authorizing Zalo:', { userId });

    const { url, codeVerifier, state } =
      this.zaloOAuthService.getAuthorizationUrl(dto.state);

    // Store codeVerifier and state in Redis for callback verification
    await this.oauthStateService.storeState(state, {
      codeVerifier,
      state,
      userId,
      createdAt: Date.now(),
    });

    // Redirect to Zalo OAuth page
    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Zalo
   * GET /api/platform-connections/zalo/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('oa_id') oaId: string,
    @Query('code_challenge') codeChallenge: string,
    @Res() res: Response,
  ) {
    console.log('🔙 Zalo callback received:', {
      code: code?.substring(0, 20) + '...',
      state,
      oaId,
      codeChallenge: codeChallenge?.substring(0, 20) + '...',
    });

    if (!code || !state) {
      throw new BadRequestException('Authorization code and state are required');
    }

    // Retrieve stored state data from Redis
    const storedStateData = await this.oauthStateService.getAndDeleteState(state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    console.log('✅ State verified, exchanging code for token');

    // Verify state matches
    if (state !== storedStateData.state) {
      throw new BadRequestException('Invalid OAuth state');
    }

    // Exchange code for access token (pass oa_id if available)
    const tokenResponse = await this.zaloOAuthService.exchangeCodeForToken(
      code,
      storedStateData.codeVerifier,
      oaId, // Pass OA ID from callback
    );

    // Get OA information
    const oaInfo = await this.zaloOAuthService.getOAInfo(
      tokenResponse.access_token,
    );

    // Save platform connection to database
    let connectionId: string;
    if (storedStateData.userId) {
      const connection = await this.zaloOAuthService.savePlatformConnection(
        storedStateData.userId,
        tokenResponse,
        oaInfo,
      );
      connectionId = connection._id.toString();

      // Sync conversations in background (don't wait for completion)
      this.zaloOAuthService
        .syncConversations(connectionId, tokenResponse.access_token)
        .catch((error) => {
          console.error('Failed to sync conversations:', error);
        });
    }

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return res.redirect(
      `${frontendUrl}/platform-connections?status=success&platform=zalo&account=${encodeURIComponent(oaInfo.name)}`,
    );
  }

  /**
   * Alternative: Get authorization URL as JSON (for frontend to handle redirect)
   * GET /api/platform-connections/zalo/auth-url
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(@Query() dto: ZaloAuthUrlDto, @Request() req: any) {
    const userId = req.user.userId;
    const { url, codeVerifier, state } = this.zaloOAuthService.getAuthorizationUrl(
      dto.state,
    );

    console.log('📝 Generating auth URL and storing state for user:', { userId, state });

    // Store state in Redis so callback can verify it
    await this.oauthStateService.storeState(state, {
      codeVerifier,
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
   * POST /api/platform-connections/zalo/complete
   */
  @Get('complete')
  @UseGuards(JwtAuthGuard)
  async completeOAuth(
    @Query() dto: ZaloCallbackDto,
    @Request() req,
  ) {
    const userId = req.user.userId;

    // Exchange code for token
    const tokenResponse = await this.zaloOAuthService.exchangeCodeForToken(
      dto.code,
      dto.code_verifier,
    );

    // Get OA info
    const oaInfo = await this.zaloOAuthService.getOAInfo(
      tokenResponse.access_token,
    );

    // Save to database
    const connection = await this.zaloOAuthService.savePlatformConnection(
      userId,
      tokenResponse,
      oaInfo,
    );

    // Sync conversations in background (don't wait for completion)
    const connectionId = connection._id.toString();
    this.zaloOAuthService
      .syncConversations(connectionId, tokenResponse.access_token)
      .catch((error) => {
        console.error('Failed to sync conversations:', error);
      });

    return {
      success: true,
      connection: {
        id: connection._id,
        platform: connection.platform,
        accountName: connection.platformAccountName,
        status: connection.status,
      },
    };
  }
}
