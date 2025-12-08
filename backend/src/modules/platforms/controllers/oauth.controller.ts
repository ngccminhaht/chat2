import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Platform, ConnectionStatus } from '@/common/constants';
import { PlatformRegistryService } from '@/common/platform';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

interface AuthUrlRequest {
  redirectUri: string;
}

interface OAuthState {
  platform: Platform;
  userId: string;
  codeVerifier?: string;
  timestamp: number;
}

/**
 * Unified OAuth Controller
 * Handles OAuth flows for all platforms
 *
 * Routes:
 * - POST /api/platforms/:platform/oauth/auth-url - Get OAuth authorization URL
 * - GET  /api/platforms/:platform/oauth/callback - Handle OAuth callback
 * - POST /api/platforms/:platform/oauth/refresh  - Refresh access token
 * - POST /api/platforms/:platform/oauth/revoke   - Revoke access token
 */
@Controller('platforms')
export class UnifiedOAuthController {
  private readonly logger = new Logger(UnifiedOAuthController.name);

  // In-memory state storage (should be Redis in production)
  private readonly stateStore = new Map<string, OAuthState>();

  constructor(
    private readonly platformRegistry: PlatformRegistryService,
    @InjectModel(PlatformConnection.name)
    private readonly platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {}

  /**
   * Generate OAuth authorization URL
   * Requires authentication
   */
  @Post(':platform/oauth/auth-url')
  @UseGuards(JwtAuthGuard)
  async getAuthUrl(
    @Param('platform') platform: string,
    @Body() body: AuthUrlRequest,
    @CurrentUser() user: { sub: string },
  ): Promise<{ authUrl: string; state: string }> {
    const platformEnum = this.parsePlatform(platform);

    this.logger.log(`Generating auth URL for ${platform}`);

    const adapter = this.platformRegistry.getAdapter(platformEnum);

    // Generate state for CSRF protection
    const state = randomBytes(32).toString('hex');

    // Store state with user info
    const stateData: OAuthState = {
      platform: platformEnum,
      userId: user.sub,
      timestamp: Date.now(),
    };

    // Generate PKCE if required
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (adapter.oauth.usesPKCE?.()) {
      codeVerifier = adapter.oauth.generateCodeVerifier?.();
      codeChallenge = adapter.oauth.generateCodeChallenge?.(codeVerifier || '');
      stateData.codeVerifier = codeVerifier;
    }

    this.stateStore.set(state, stateData);

    // Clean up old states (older than 10 minutes)
    this.cleanupOldStates();

    // Generate auth URL
    const authUrl = adapter.oauth.generateAuthUrl({
      redirectUri: body.redirectUri,
      state,
      codeChallenge,
      scopes: undefined, // Use platform default scopes
    });

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback
   * This endpoint is called by the platform after user authorization
   */
  @Get(':platform/oauth/callback')
  async handleCallback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
  ): Promise<{ success: boolean; message: string }> {
    const platformEnum = this.parsePlatform(platform);

    // Check for OAuth error
    if (error) {
      this.logger.warn(`OAuth error for ${platform}: ${error} - ${errorDescription}`);
      throw new BadRequestException(`OAuth error: ${errorDescription || error}`);
    }

    // Validate code and state
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    if (!state) {
      throw new BadRequestException('State parameter is required');
    }

    // Verify state
    const stateData = this.stateStore.get(state);
    if (!stateData) {
      throw new BadRequestException('Invalid or expired state');
    }

    // Remove used state
    this.stateStore.delete(state);

    // Verify state is for correct platform
    if (stateData.platform !== platformEnum) {
      throw new BadRequestException('Platform mismatch');
    }

    // Check state expiry (10 minutes)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      throw new BadRequestException('State has expired');
    }

    this.logger.log(`Processing OAuth callback for ${platform}`);

    try {
      const adapter = this.platformRegistry.getAdapter(platformEnum);

      // Exchange code for token
      const tokenResponse = await adapter.oauth.exchangeCodeForToken({
        code,
        codeVerifier: stateData.codeVerifier,
      });

      // Get account info
      const accounts = await adapter.oauth.getAccountInfo(tokenResponse.accessToken);

      if (accounts.length === 0) {
        throw new BadRequestException('No accounts found');
      }

      // Create or update platform connections for each account
      for (const account of accounts) {
        await this.createOrUpdateConnection(
          stateData.userId,
          platformEnum,
          account,
          tokenResponse,
        );
      }

      this.logger.log(
        `OAuth successful for ${platform}: ${accounts.length} account(s) connected`,
      );

      return {
        success: true,
        message: `Successfully connected ${accounts.length} ${platform} account(s)`,
      };
    } catch (error) {
      this.logger.error(`OAuth callback failed for ${platform}: ${error.message}`);
      throw new BadRequestException(`OAuth failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token for a platform connection
   */
  @Post(':platform/oauth/refresh')
  @UseGuards(JwtAuthGuard)
  async refreshToken(
    @Param('platform') platform: string,
    @Body('connectionId') connectionId: string,
    @CurrentUser() user: { sub: string },
  ): Promise<{ success: boolean; expiresAt?: Date }> {
    const platformEnum = this.parsePlatform(platform);

    // Find connection
    const connection = await this.platformConnectionModel.findOne({
      _id: new Types.ObjectId(connectionId),
      userId: new Types.ObjectId(user.sub),
      platform: platformEnum,
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (!connection.credentials.refreshToken) {
      throw new BadRequestException('No refresh token available');
    }

    this.logger.log(`Refreshing token for ${platform} connection ${connectionId}`);

    try {
      const adapter = this.platformRegistry.getAdapter(platformEnum);

      const tokenResponse = await adapter.oauth.refreshToken(
        connection.credentials.refreshToken,
      );

      if (!tokenResponse) {
        throw new BadRequestException('Token refresh failed');
      }

      // Update connection credentials
      await this.platformConnectionModel.updateOne(
        { _id: connection._id },
        {
          $set: {
            'credentials.accessToken': tokenResponse.accessToken,
            'credentials.refreshToken': tokenResponse.refreshToken || connection.credentials.refreshToken,
            'credentials.expiresAt': tokenResponse.expiresAt,
            status: ConnectionStatus.ACTIVE,
          },
        },
      );

      this.logger.log(`Token refreshed successfully for connection ${connectionId}`);

      return {
        success: true,
        expiresAt: tokenResponse.expiresAt,
      };
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`);

      // Mark connection as expired
      await this.platformConnectionModel.updateOne(
        { _id: connection._id },
        { $set: { status: ConnectionStatus.EXPIRED } },
      );

      throw new BadRequestException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke access token and disconnect platform
   */
  @Post(':platform/oauth/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeToken(
    @Param('platform') platform: string,
    @Body('connectionId') connectionId: string,
    @CurrentUser() user: { sub: string },
  ): Promise<{ success: boolean }> {
    const platformEnum = this.parsePlatform(platform);

    // Find connection
    const connection = await this.platformConnectionModel.findOne({
      _id: new Types.ObjectId(connectionId),
      userId: new Types.ObjectId(user.sub),
      platform: platformEnum,
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    this.logger.log(`Revoking token for ${platform} connection ${connectionId}`);

    try {
      const adapter = this.platformRegistry.getAdapter(platformEnum);

      // Try to revoke token with platform (optional)
      if (adapter.oauth.revokeToken) {
        try {
          await adapter.oauth.revokeToken(connection.credentials.accessToken);
        } catch (error) {
          // Log but don't fail if revoke fails
          this.logger.warn(`Token revoke failed (continuing): ${error.message}`);
        }
      }

      // Mark connection as inactive
      await this.platformConnectionModel.updateOne(
        { _id: connection._id },
        {
          $set: {
            status: ConnectionStatus.INACTIVE,
            'credentials.accessToken': '',
            'credentials.refreshToken': '',
          },
        },
      );

      this.logger.log(`Connection ${connectionId} revoked successfully`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Token revoke failed: ${error.message}`);
      throw new BadRequestException(`Revoke failed: ${error.message}`);
    }
  }

  /**
   * Get all connections for current user
   */
  @Get('connections')
  @UseGuards(JwtAuthGuard)
  async getConnections(
    @CurrentUser() user: { sub: string },
  ): Promise<PlatformConnectionDocument[]> {
    return this.platformConnectionModel.find({
      userId: new Types.ObjectId(user.sub),
      status: { $ne: ConnectionStatus.INACTIVE },
    });
  }

  /**
   * Parse platform string to Platform enum
   */
  private parsePlatform(platform: string): Platform {
    const normalizedPlatform = platform.toLowerCase();

    switch (normalizedPlatform) {
      case 'facebook':
      case 'fb':
        return Platform.FACEBOOK;
      case 'zalo':
        return Platform.ZALO;
      case 'shopee':
        return Platform.SHOPEE;
      case 'tiktok':
        return Platform.TIKTOK;
      default:
        throw new BadRequestException(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Create or update platform connection
   */
  private async createOrUpdateConnection(
    userId: string,
    platform: Platform,
    account: { platformAccountId: string; platformAccountName: string; metadata?: Record<string, any> },
    tokenResponse: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      scopes?: string[];
    },
  ): Promise<void> {
    const existingConnection = await this.platformConnectionModel.findOne({
      platform,
      platformAccountId: account.platformAccountId,
    });

    if (existingConnection) {
      // Update existing connection
      await this.platformConnectionModel.updateOne(
        { _id: existingConnection._id },
        {
          $set: {
            userId: new Types.ObjectId(userId),
            platformAccountName: account.platformAccountName,
            credentials: {
              accessToken: tokenResponse.accessToken,
              refreshToken: tokenResponse.refreshToken,
              expiresAt: tokenResponse.expiresAt,
              scopes: tokenResponse.scopes,
            },
            status: ConnectionStatus.ACTIVE,
            metadata: {
              ...existingConnection.metadata,
              ...account.metadata,
            },
            lastSyncAt: new Date(),
          },
        },
      );

      this.logger.debug(
        `Updated connection for ${platform}:${account.platformAccountId}`,
      );
    } else {
      // Create new connection
      await this.platformConnectionModel.create({
        userId: new Types.ObjectId(userId),
        platform,
        platformAccountId: account.platformAccountId,
        platformAccountName: account.platformAccountName,
        credentials: {
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken,
          expiresAt: tokenResponse.expiresAt,
          scopes: tokenResponse.scopes,
        },
        status: ConnectionStatus.ACTIVE,
        metadata: account.metadata || {},
        lastSyncAt: new Date(),
      });

      this.logger.debug(
        `Created connection for ${platform}:${account.platformAccountId}`,
      );
    }
  }

  /**
   * Clean up expired OAuth states
   */
  private cleanupOldStates(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [key, value] of this.stateStore.entries()) {
      if (now - value.timestamp > maxAge) {
        this.stateStore.delete(key);
      }
    }
  }
}
