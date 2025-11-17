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
   * GET /api/platform-connections/zalo/authorize
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(
    @Query() dto: ZaloAuthUrlDto,
    @Request() req,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;
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
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException('Authorization code and state are required');
    }

    // Retrieve stored state data from Redis
    const storedStateData = await this.oauthStateService.getAndDeleteState(state);
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found or expired');
    }

    // Verify state matches
    if (state !== storedStateData.state) {
      throw new BadRequestException('Invalid OAuth state');
    }

    // Exchange code for access token
    const tokenResponse = await this.zaloOAuthService.exchangeCodeForToken(
      code,
      storedStateData.codeVerifier,
    );

    // Get OA information
    const oaInfo = await this.zaloOAuthService.getOAInfo(
      tokenResponse.access_token,
    );

    // Save platform connection to database
    if (storedStateData.userId) {
      await this.zaloOAuthService.savePlatformConnection(
        storedStateData.userId,
        tokenResponse,
        oaInfo,
      );
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
  getAuthUrl(@Query() dto: ZaloAuthUrlDto) {
    const { url, codeVerifier, state } = this.zaloOAuthService.getAuthorizationUrl(
      dto.state,
    );

    return {
      authUrl: url,
      codeVerifier,
      state,
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
