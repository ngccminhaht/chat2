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
import { ShopeeOAuthService } from './shopee-oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { ShopeeAuthUrlDto, ShopeeCallbackDto } from './dto/shopee-oauth.dto';

@Controller('platform-connections/shopee')
export class ShopeeOAuthController {
  constructor(
    private readonly shopeeOAuthService: ShopeeOAuthService,
    private readonly oauthStateService: OAuthStateService,
  ) {}

  /**
   * Step 1: Generate authorization URL and redirect user
   * GET /api/platform-connections/shopee/authorize?userId=xxx
   */
  @Get('authorize')
  async authorize(
    @Query() dto: ShopeeAuthUrlDto,
    @Query('userId') userId: string,
    @Res() res: Response,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    console.log('🔐 User authorizing Shopee shop:', { userId });

    const { url, state } = this.shopeeOAuthService.getAuthorizationUrl(dto.state);

    // Store state in Redis for callback verification
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
    });

    // Redirect to Shopee OAuth page
    return res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback from Shopee
   * GET /api/platform-connections/shopee/callback?code=xxx&shop_id=xxx
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('shop_id') shopId: string,
    @Res() res: Response,
  ) {
    console.log('🔙 Shopee callback received:', {
      code: code?.substring(0, 20) + '...',
      shopId,
    });

    if (!code || !shopId) {
      throw new BadRequestException('Authorization code and shop_id are required');
    }

    // Note: Shopee doesn't return state in callback
    // We'll retrieve the most recent state for this flow
    // In production, you might want to use a more robust state management

    // Exchange code for access token
    const tokenResponse = await this.shopeeOAuthService.exchangeCodeForToken(
      code,
      shopId,
    );

    // Get shop information
    const shopInfo = await this.shopeeOAuthService.getShopInfo(
      tokenResponse.access_token,
      tokenResponse.shop_id,
    );

    // For now, we'll get userId from a temporary store or require re-authentication
    // In a production app, you'd use a more robust state management
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    // Store connection info temporarily and redirect to frontend to complete
    // Frontend will need to call complete endpoint with userId
    const tempId = Math.random().toString(36).substring(7);
    await this.oauthStateService.storeState(`temp_shopee_${tempId}`, {
      state: tempId,
      tokenResponse,
      shopInfo,
      createdAt: Date.now(),
    });

    return res.redirect(
      `${frontendUrl}/platform-connections/shopee/complete?temp_id=${tempId}&shop_name=${encodeURIComponent(shopInfo.shop_name)}`,
    );
  }

  /**
   * Alternative: Get authorization URL as JSON (for frontend to handle redirect)
   * GET /api/platform-connections/shopee/auth-url
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(@Query() dto: ShopeeAuthUrlDto, @Request() req: any) {
    const userId = req.user.userId;
    const { url, state } = this.shopeeOAuthService.getAuthorizationUrl(dto.state);

    console.log('📝 Generating Shopee auth URL for user:', { userId, state });

    // Store state in Redis
    await this.oauthStateService.storeState(state, {
      state,
      userId,
      createdAt: Date.now(),
    });

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Complete OAuth with temporary connection data
   * GET /api/platform-connections/shopee/complete?temp_id=xxx
   */
  @Get('complete')
  @UseGuards(JwtAuthGuard)
  async completeOAuth(
    @Query('temp_id') tempId: string,
    @Request() req: any,
  ) {
    const userId = req.user.userId;

    if (!tempId) {
      throw new BadRequestException('temp_id is required');
    }

    // Retrieve temporary connection data
    const tempData = await this.oauthStateService.getAndDeleteState(`temp_shopee_${tempId}`);
    if (!tempData) {
      throw new BadRequestException('Temporary connection data not found or expired');
    }

    const { tokenResponse, shopInfo } = tempData;

    // Save to database with authenticated user
    const connection = await this.shopeeOAuthService.savePlatformConnection(
      userId,
      tokenResponse,
      shopInfo,
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
