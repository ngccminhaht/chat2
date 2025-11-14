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
import { ZaloAuthUrlDto, ZaloCallbackDto } from './dto/zalo-oauth.dto';

@Controller('platform-connections/zalo')
export class ZaloOAuthController {
  constructor(private readonly zaloOAuthService: ZaloOAuthService) {}

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/platform-connections/zalo/authorize
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  authorize(@Query() dto: ZaloAuthUrlDto, @Res() res: Response) {
    const { url, codeVerifier, state } = this.zaloOAuthService.getAuthorizationUrl(
      dto.state,
    );

    // Store codeVerifier and state in session/cookie for callback verification
    // For simplicity, we'll pass it via query param (in production, use session/Redis)
    const callbackState = Buffer.from(
      JSON.stringify({ codeVerifier, state }),
    ).toString('base64');

    // Store in cookie for callback
    res.cookie('zalo_oauth_state', callbackState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000, // 10 minutes
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
    @Request() req,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    // Retrieve stored state and code_verifier from cookie
    const storedStateData = req.cookies?.zalo_oauth_state;
    if (!storedStateData) {
      throw new BadRequestException('OAuth state not found');
    }

    const { codeVerifier, state: storedState } = JSON.parse(
      Buffer.from(storedStateData, 'base64').toString(),
    );

    // Verify state matches
    if (state !== storedState) {
      throw new BadRequestException('Invalid OAuth state');
    }

    // Clear the cookie
    res.clearCookie('zalo_oauth_state');

    // Exchange code for access token
    const tokenResponse = await this.zaloOAuthService.exchangeCodeForToken(
      code,
      codeVerifier,
    );

    // Get OA information
    const oaInfo = await this.zaloOAuthService.getOAInfo(
      tokenResponse.access_token,
    );

    // For now, we'll assume user is already authenticated via JWT
    // In production, you might want to pass userId via state parameter
    // or require user to be logged in before starting OAuth flow

    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return res.redirect(
      `${frontendUrl}/platform-connections?status=success&platform=zalo&account=${oaInfo.name}`,
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
