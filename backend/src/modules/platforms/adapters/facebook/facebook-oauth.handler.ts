import { Injectable } from '@nestjs/common';
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
  FacebookTokenResponse,
  FacebookPageInfo,
  FacebookUserInfo,
} from './types/facebook-webhook.types';

/**
 * Facebook OAuth Handler
 * Handles OAuth authorization, token exchange, and account info retrieval
 */
@Injectable()
export class FacebookOAuthHandler extends BaseOAuthHandler {
  readonly platform = Platform.FACEBOOK;

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphApiVersion = 'v19.0';
  private readonly graphApiBaseUrl = 'https://graph.facebook.com';

  // Facebook OAuth scopes for page messaging
  private readonly defaultScopes = [
    'public_profile',
    'email',
    'pages_manage_metadata',
    'pages_read_engagement',
    'pages_show_list',
    'pages_read_user_content',
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_messaging',
    'pages_utility_messaging',
    'business_management',
  ];

  constructor(private readonly envService: EnvService) {
    super('FacebookOAuthHandler');
    this.appId = this.envService.get('FACEBOOK_APP_ID');
    this.appSecret = this.envService.get('FACEBOOK_APP_SECRET');
  }

  /**
   * Generate Facebook OAuth authorization URL
   */
  generateAuthUrl(params: AuthUrlParams): string {
    const scopes = params.scopes || this.defaultScopes;

    return this.buildUrl(`https://www.facebook.com/${this.graphApiVersion}/dialog/oauth`, {
      client_id: this.appId,
      redirect_uri: params.redirectUri,
      response_type: 'code',
      scope: scopes.join(','),
      state: params.state,
      auth_type: 'rerequest',
      ...params.extras,
    });
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse> {
    try {
      this.logger.log('Exchanging Facebook code for token');

      const urlParams = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: params.redirectUri,
        code: params.code,
      });

      const response = await axios.post<FacebookTokenResponse>(
        `${this.graphApiBaseUrl}/${this.graphApiVersion}/oauth/access_token`,
        urlParams.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (response.data.error) {
        this.logOAuthError('token exchange', response.data.error);
        throw new Error(response.data.error.message);
      }

      if (!response.data.access_token) {
        throw new Error('Response missing access_token');
      }

      this.logger.log('Token exchange successful');

      return this.createTokenResponse(response.data.access_token, {
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type || 'Bearer',
        rawResponse: response.data,
      });
    } catch (error) {
      this.logOAuthError('token exchange', error);
      throw error;
    }
  }

  /**
   * Refresh token - Facebook doesn't support traditional refresh tokens
   * Long-lived tokens need to be exchanged before expiry
   */
  async refreshToken(accessToken: string): Promise<TokenResponse | null> {
    try {
      this.logger.log('Exchanging Facebook token for long-lived token');

      const response = await axios.get<FacebookTokenResponse>(
        `${this.graphApiBaseUrl}/${this.graphApiVersion}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: accessToken,
          },
        },
      );

      if (response.data.error || !response.data.access_token) {
        return null;
      }

      return this.createTokenResponse(response.data.access_token, {
        expiresIn: response.data.expires_in,
        rawResponse: response.data,
      });
    } catch (error) {
      this.logOAuthError('token refresh', error);
      return null;
    }
  }

  /**
   * Get Facebook pages for the authenticated user
   * Returns list of pages with their individual access tokens
   */
  async getAccountInfo(accessToken: string): Promise<PlatformAccountInfo[]> {
    try {
      this.logger.log('Fetching Facebook pages');

      const response = await axios.get<{ data: FacebookPageInfo[]; error?: any }>(
        `${this.graphApiBaseUrl}/${this.graphApiVersion}/me/accounts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,access_token,picture.width(100).height(100),category',
          },
        },
      );

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const pages = response.data.data || [];
      this.logger.log(`Retrieved ${pages.length} Facebook pages`);

      return pages.map((page) => ({
        platformAccountId: page.id,
        platformAccountName: page.name,
        avatar: page.picture?.data?.url,
        metadata: {
          accessToken: page.access_token, // Page-specific access token
          category: page.category,
          picture: page.picture,
        },
      }));
    } catch (error) {
      this.logOAuthError('get account info', error);
      throw error;
    }
  }

  /**
   * Get authenticated user's profile
   */
  async getUserProfile(accessToken: string): Promise<FacebookUserInfo> {
    try {
      this.logger.log('Fetching Facebook user profile');

      const response = await axios.get<FacebookUserInfo & { error?: any }>(
        `${this.graphApiBaseUrl}/${this.graphApiVersion}/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,email,picture.width(100).height(100)',
          },
        },
      );

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      this.logger.log(`Retrieved user profile: ${response.data.name}`);
      return response.data;
    } catch (error) {
      this.logOAuthError('get user profile', error);
      throw error;
    }
  }

  /**
   * Get sender profile (for message processing)
   */
  async getSenderProfile(
    pageAccessToken: string,
    senderId: string,
  ): Promise<{ id: string; name: string; profile_pic?: string }> {
    try {
      const response = await axios.get(
        `${this.graphApiBaseUrl}/${this.graphApiVersion}/${senderId}`,
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
          },
          params: {
            fields: 'id,name,profile_pic',
          },
        },
      );

      if (response.data.error) {
        return { id: senderId, name: `Facebook User ${senderId}` };
      }

      return response.data;
    } catch (error) {
      this.logger.debug(`Failed to fetch sender profile for ${senderId}`);
      return { id: senderId, name: `Facebook User ${senderId}` };
    }
  }

  /**
   * Facebook doesn't use PKCE
   */
  usesPKCE(): boolean {
    return false;
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
