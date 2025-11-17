import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import axios from 'axios';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { ZaloTokenResponse, ZaloOAInfo } from './dto/zalo-oauth.dto';

@Injectable()
export class ZaloOAuthService {
  private readonly logger = new Logger(ZaloOAuthService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor(
    private configService: ConfigService,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {
    this.appId = this.configService.get<string>('ZALO_APP_ID');
    this.appSecret = this.configService.get<string>('ZALO_APP_SECRET');
    this.redirectUri = this.configService.get<string>('ZALO_REDIRECT_URI');
  }

  /**
   * Generate PKCE code verifier (random string)
   */
  generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate Zalo OAuth authorization URL
   * Scopes for reading messages from OA:
   * - get_oa_info: Get OA information
   * - manage_message: Send and receive messages
   * - get_user_info: Get user information
   */
  getAuthorizationUrl(state?: string): {
    url: string;
    codeVerifier: string;
    state: string;
  } {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const finalState = state || randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      code_challenge: codeChallenge,
      state: finalState,
    });

    return {
      url: `https://oauth.zaloapp.com/v4/oa/permission?${params.toString()}`,
      codeVerifier,
      state: finalState,
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    oaId?: string,
  ): Promise<ZaloTokenResponse> {
    try {
      // Create URL-encoded form data
      const params: Record<string, string> = {
        app_id: this.appId,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
      };

      // Add oa_id if provided (required for OA OAuth)
      if (oaId) {
        params.oa_id = oaId;
      }

      const formData = new URLSearchParams(params);

      this.logger.log('Exchanging code for token with Zalo API:', {
        app_id: this.appId,
        hasOaId: !!oaId,
        grant_type: 'authorization_code',
      });

      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'secret_key': this.appSecret,
          },
        },
      );

      this.logger.log('Zalo token response:', response.data);

      if (response.data.error) {
        this.logger.error('Zalo OAuth error:', response.data);
        throw new BadRequestException(
          `Zalo OAuth error: ${response.data.error_description || response.data.error}`,
        );
      }

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to exchange authorization code');
    }
  }

  /**
   * Get OA (Official Account) information
   */
  async getOAInfo(accessToken: string): Promise<ZaloOAInfo> {
    try {
      const response = await axios.get('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: {
          access_token: accessToken,
        },
      });

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get OA info: ${response.data.message}`,
        );
      }

      const data = response.data.data;
      return {
        oa_id: data.oa_id,
        name: data.name,
        description: data.description,
        avatar: data.avatar,
      };
    } catch (error) {
      this.logger.error('Failed to get OA info', error);
      throw new BadRequestException('Failed to fetch Zalo OA information');
    }
  }

  /**
   * Save platform connection to database
   */
  async savePlatformConnection(
    userId: string,
    tokenResponse: ZaloTokenResponse,
    oaInfo: ZaloOAInfo,
  ): Promise<PlatformConnectionDocument> {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Check if connection already exists
    const existing = await this.platformConnectionModel
      .findOne({
        platform: 'zalo',
        platformAccountId: oaInfo.oa_id,
      })
      .exec();

    if (existing) {
      // Update existing connection
      existing.userId = new Types.ObjectId(userId);
      existing.platformAccountName = oaInfo.name;
      existing.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      };
      existing.status = 'active';
      existing.metadata = {
        oaId: oaInfo.oa_id,
        description: oaInfo.description,
        avatar: oaInfo.avatar,
      };
      existing.lastSyncAt = new Date();

      return existing.save();
    }

    // Create new connection
    return this.platformConnectionModel.create({
      userId: new Types.ObjectId(userId),
      platform: 'zalo',
      platformAccountId: oaInfo.oa_id,
      platformAccountName: oaInfo.name,
      credentials: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      },
      status: 'active',
      metadata: {
        oaId: oaInfo.oa_id,
        description: oaInfo.description,
        avatar: oaInfo.avatar,
      },
      lastSyncAt: new Date(),
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<ZaloTokenResponse> {
    try {
      // Create URL-encoded form data
      const params = new URLSearchParams({
        app_id: this.appId,
        app_secret: this.appSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/access_token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (response.data.error) {
        this.logger.error('Zalo token refresh error:', response.data);
        throw new BadRequestException(
          `Zalo token refresh error: ${response.data.error_description || response.data.error}`,
        );
      }

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      this.logger.error('Failed to refresh token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to refresh access token');
    }
  }
}
