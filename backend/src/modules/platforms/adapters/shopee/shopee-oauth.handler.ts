import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
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
  ShopeeTokenResponse,
  ShopeeShopInfo,
} from './types/shopee-webhook.types';

/**
 * Shopee OAuth Handler
 * Handles OAuth authorization, token exchange, and shop info retrieval
 */
@Injectable()
export class ShopeeOAuthHandler extends BaseOAuthHandler {
  readonly platform = Platform.SHOPEE;

  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly envService: EnvService) {
    super('ShopeeOAuthHandler');
    this.partnerId = this.envService.get('SHOPEE_PARTNER_ID');
    this.partnerKey = this.envService.get('SHOPEE_PARTNER_KEY');
    // Use test or production API based on environment
    this.apiBaseUrl = this.envService.get('SHOPEE_API_URL') || 'https://partner.shopeemobile.com';
  }

  /**
   * Generate Shopee OAuth authorization URL
   */
  generateAuthUrl(params: AuthUrlParams): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/shop/auth_partner';
    const baseString = `${this.partnerId}${path}${timestamp}`;
    const sign = this.generateSignature(baseString);

    return this.buildUrl(`${this.apiBaseUrl}${path}`, {
      partner_id: this.partnerId,
      timestamp: timestamp.toString(),
      sign,
      redirect: params.redirectUri,
    });
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse> {
    try {
      this.logger.log('Exchanging Shopee code for token');

      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/auth/token/get';
      const baseString = `${this.partnerId}${path}${timestamp}`;
      const sign = this.generateSignature(baseString);

      const response = await axios.post<ShopeeTokenResponse>(
        `${this.apiBaseUrl}${path}`,
        {
          code: params.code,
          partner_id: parseInt(this.partnerId),
        },
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
          },
        },
      );

      if (response.data.error) {
        this.logOAuthError('token exchange', response.data);
        throw new Error(response.data.message || response.data.error);
      }

      this.logger.log('Token exchange successful');

      return this.createTokenResponse(response.data.access_token, {
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expire_in,
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
      this.logger.log('Refreshing Shopee access token');

      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/auth/access_token/get';
      const baseString = `${this.partnerId}${path}${timestamp}`;
      const sign = this.generateSignature(baseString);

      const response = await axios.post<ShopeeTokenResponse>(
        `${this.apiBaseUrl}${path}`,
        {
          refresh_token: refreshToken,
          partner_id: parseInt(this.partnerId),
        },
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
          },
        },
      );

      if (response.data.error || !response.data.access_token) {
        return null;
      }

      return this.createTokenResponse(response.data.access_token, {
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expire_in,
        rawResponse: response.data,
      });
    } catch (error) {
      this.logOAuthError('token refresh', error);
      return null;
    }
  }

  /**
   * Get shop information
   */
  async getAccountInfo(accessToken: string): Promise<PlatformAccountInfo[]> {
    try {
      this.logger.log('Fetching Shopee shop info');

      const timestamp = Math.floor(Date.now() / 1000);
      const path = '/api/v2/shop/get_shop_info';
      const baseString = `${this.partnerId}${path}${timestamp}${accessToken}`;
      const sign = this.generateSignature(baseString);

      const response = await axios.get<{ response?: ShopeeShopInfo; error?: string }>(
        `${this.apiBaseUrl}${path}`,
        {
          params: {
            partner_id: this.partnerId,
            timestamp,
            sign,
            access_token: accessToken,
          },
        },
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      const shopInfo = response.data.response;
      if (!shopInfo) {
        throw new Error('No shop info in response');
      }

      this.logger.log(`Retrieved shop info: ${shopInfo.shop_name}`);

      return [
        {
          platformAccountId: shopInfo.shop_id.toString(),
          platformAccountName: shopInfo.shop_name,
          metadata: {
            region: shopInfo.region,
            status: shopInfo.status,
            isSip: shopInfo.is_sip,
            isCb: shopInfo.is_cb,
          },
        },
      ];
    } catch (error) {
      this.logOAuthError('get account info', error);
      throw error;
    }
  }

  /**
   * Shopee doesn't use PKCE
   */
  usesPKCE(): boolean {
    return false;
  }

  /**
   * Generate Shopee API signature
   */
  private generateSignature(baseString: string): string {
    return createHmac('sha256', this.partnerKey)
      .update(baseString)
      .digest('hex');
  }

  /**
   * Get partner key (for signature verification)
   */
  getPartnerKey(): string {
    return this.partnerKey;
  }

  /**
   * Get partner ID
   */
  getPartnerId(): string {
    return this.partnerId;
  }
}
