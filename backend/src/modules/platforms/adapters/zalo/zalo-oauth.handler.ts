import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import axios from 'axios';
import { Platform } from '@/common/constants';
import { EnvService } from '@/common/env';
import {
  BaseOAuthHandler,
  AuthUrlParams,
  TokenExchangeParams,
  TokenResponse,
  PlatformAccountInfo,
} from '@/common/platform';
import {
  ZaloTokenResponse,
  ZaloOAInfo,
  ZaloUserProfile,
} from './types/zalo-webhook.types';

/**
 * Zalo OAuth Handler
 * Handles OAuth authorization with PKCE, token exchange, and account info retrieval
 */
@Injectable()
export class ZaloOAuthHandler extends BaseOAuthHandler {
  readonly platform = Platform.ZALO;

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly apiBaseUrl = 'https://oauth.zaloapp.com';
  private readonly openApiBaseUrl = 'https://openapi.zalo.me';

  constructor(private readonly envService: EnvService) {
    super('ZaloOAuthHandler');
    this.appId = this.envService.get('ZALO_APP_ID');
    this.appSecret = this.envService.get('ZALO_APP_SECRET');
  }

  /**
   * Generate Zalo OAuth authorization URL with PKCE
   */
  generateAuthUrl(params: AuthUrlParams): string {
    const codeChallenge = params.codeVerifier
      ? this.generateCodeChallenge(params.codeVerifier)
      : '';

    return this.buildUrl(`${this.apiBaseUrl}/v4/oa/permission`, {
      app_id: this.appId,
      redirect_uri: params.redirectUri,
      code_challenge: codeChallenge,
      state: params.state,
    });
  }

  /**
   * Exchange authorization code for access token
   * Zalo requires code_verifier for PKCE
   */
  async exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse> {
    try {
      this.logger.log('Exchanging Zalo code for token');

      if (!params.codeVerifier) {
        throw new Error('code_verifier is required for Zalo PKCE flow');
      }

      const urlParams = new URLSearchParams({
        app_id: this.appId,
        code: params.code,
        code_verifier: params.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: params.redirectUri,
      });

      const response = await axios.post<ZaloTokenResponse>(
        `${this.apiBaseUrl}/v4/oa/access_token`,
        urlParams.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: this.appSecret,
          },
        },
      );

      if (response.data.error && response.data.error !== 0) {
        this.logOAuthError('token exchange', response.data);
        throw new Error(response.data.message || 'Token exchange failed');
      }

      this.logger.log('Token exchange successful');

      return this.createTokenResponse(response.data.access_token, {
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        rawResponse: response.data,
      });
    } catch (error) {
      this.logOAuthError('token exchange', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse | null> {
    try {
      this.logger.log('Refreshing Zalo access token');

      const urlParams = new URLSearchParams({
        app_id: this.appId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await axios.post<ZaloTokenResponse>(
        `${this.apiBaseUrl}/v4/oa/access_token`,
        urlParams.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: this.appSecret,
          },
        },
      );

      if (response.data.error && response.data.error !== 0) {
        this.logger.warn('Token refresh failed:', response.data.message);
        return null;
      }

      this.logger.log('Token refresh successful');

      return this.createTokenResponse(response.data.access_token, {
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        rawResponse: response.data,
      });
    } catch (error) {
      this.logOAuthError('token refresh', error);
      return null;
    }
  }

  /**
   * Get OA (Official Account) information
   */
  async getAccountInfo(accessToken: string): Promise<PlatformAccountInfo[]> {
    try {
      this.logger.log('Fetching Zalo OA info');

      const response = await axios.get<{ data?: ZaloOAInfo; error?: number; message?: string }>(
        `${this.openApiBaseUrl}/v2.0/oa/getoa`,
        {
          headers: {
            access_token: accessToken,
          },
        },
      );

      if (response.data.error && response.data.error !== 0) {
        throw new Error(response.data.message || 'Failed to get OA info');
      }

      const oaInfo = response.data.data;
      if (!oaInfo) {
        throw new Error('No OA data in response');
      }

      this.logger.log(`Retrieved OA info: ${oaInfo.name}`);

      // Zalo returns single OA per token
      return [
        {
          platformAccountId: oaInfo.oaId,
          platformAccountName: oaInfo.name,
          avatar: oaInfo.avatar,
          metadata: {
            description: oaInfo.description,
            cover: oaInfo.cover,
            isVerified: oaInfo.isVerified,
            oaType: oaInfo.oaType,
            cateName: oaInfo.cateName,
            numFollower: oaInfo.numFollower,
          },
        },
      ];
    } catch (error) {
      this.logOAuthError('get account info', error);
      throw error;
    }
  }

  /**
   * Get user profile by user ID
   */
  async getUserProfile(accessToken: string, userId: string): Promise<ZaloUserProfile> {
    try {
      const response = await axios.get<{ data?: ZaloUserProfile; error?: number; message?: string }>(
        `${this.openApiBaseUrl}/v2.0/oa/getprofile`,
        {
          headers: {
            access_token: accessToken,
          },
          params: {
            data: JSON.stringify({ user_id: userId }),
          },
        },
      );

      if (response.data.error && response.data.error !== 0) {
        return {
          user_id: userId,
          user_id_by_app: '',
          display_name: `Zalo User ${userId.substring(0, 8)}`,
        };
      }

      return response.data.data || {
        user_id: userId,
        user_id_by_app: '',
        display_name: `Zalo User ${userId.substring(0, 8)}`,
      };
    } catch (error) {
      this.logger.debug(`Failed to fetch user profile for ${userId}`);
      return {
        user_id: userId,
        user_id_by_app: '',
        display_name: `Zalo User ${userId.substring(0, 8)}`,
      };
    }
  }

  /**
   * Zalo uses PKCE
   */
  usesPKCE(): boolean {
    return true;
  }

  /**
   * Generate PKCE code verifier
   */
  generateCodeVerifier(): string {
    return super.generateCodeVerifier();
  }

  /**
   * Generate PKCE code challenge from verifier
   * Zalo uses SHA256 + base64url encoding
   */
  generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  /**
   * Get app secret (for signature verification)
   */
  getAppSecret(): string {
    return this.appSecret;
  }

  /**
   * Get app ID
   */
  getAppId(): string {
    return this.appId;
  }
}
