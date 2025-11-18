import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, randomBytes } from 'crypto';
import axios from 'axios';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  ShopeeTokenResponse,
  ShopeeShopInfo,
  ShopeeRefreshTokenResponse,
} from './dto/shopee-oauth.dto';

@Injectable()
export class ShopeeOAuthService {
  private readonly logger = new Logger(ShopeeOAuthService.name);
  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly redirectUri: string;
  private readonly apiHost: string;

  constructor(
    private configService: ConfigService,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
  ) {
    this.partnerId = this.configService.get<string>('SHOPEE_PARTNER_ID');
    this.partnerKey = this.configService.get<string>('SHOPEE_PARTNER_KEY');
    this.redirectUri = this.configService.get<string>('SHOPEE_REDIRECT_URI');

    // Shopee API host varies by region (sg, my, th, tw, id, vn, ph)
    // Default to Vietnam region
    const region = this.configService.get<string>('SHOPEE_REGION') || 'vn';

    // Choose API host based on environment
    const isTestEnv = this.configService.get<string>('SHOPEE_ENV') === 'test';
    this.apiHost = isTestEnv
      ? `https://partner.test-stable.shopeemobile.com`  // Test environment
      : `https://partner.shopeemobile.com`;             // Production
  }

  /**
   * Generate HMAC-SHA256 signature for Shopee API
   *
   * For auth_partner endpoint: basestring = partner_id + path + timestamp
   * For other endpoints: basestring = partner_id + path + timestamp + [access_token] + [shop_id]
   */
  private generateSignature(
    path: string,
    timestamp: number,
    body?: any,
    includePartnerId: boolean = true,
  ): string {
    const partnerId = parseInt(this.partnerId);

    // Build base string
    let baseString = includePartnerId ? `${partnerId}${path}${timestamp}` : `${path}${timestamp}`;

    if (body?.access_token) {
      baseString += body.access_token;
    }
    if (body?.shop_id) {
      baseString += body.shop_id;
    }

    // Try both approaches: partner key as-is and as hex buffer
    // Shopee uses hex-encoded partner key
    let signature: string;

    try {
      // Approach 1: Treat partner key as hex string and convert to buffer
      const keyBuffer = Buffer.from(this.partnerKey, 'utf8');
      const hmac = createHmac('sha256', keyBuffer);
      hmac.update(baseString);
      signature = hmac.digest('hex');
    } catch (error) {
      // Fallback: Use partner key as-is
      const hmac = createHmac('sha256', this.partnerKey);
      hmac.update(baseString);
      signature = hmac.digest('hex');
    }

    this.logger.debug(`Signature generation:`);
    this.logger.debug(`  Base string: ${baseString}`);
    this.logger.debug(`  Partner key length: ${this.partnerKey?.length}`);
    this.logger.debug(`  Signature: ${signature}`);

    return signature;
  }

  /**
   * Generate Shopee OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): {
    url: string;
    state: string;
  } {
    const finalState = state || randomBytes(16).toString('hex');
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);

    // Auth partner: partner_id + path + timestamp
    const baseString = `${this.partnerId}${path}${timestamp}`;
    const sign = this.generateSignature(path, timestamp);

    this.logger.log('=== Shopee auth_partner URL generation ===');
    this.logger.log(`API Host: ${this.apiHost}`);
    this.logger.log(`Partner ID: ${this.partnerId}`);
    this.logger.log(`Path: ${path}`);
    this.logger.log(`Timestamp: ${timestamp}`);
    this.logger.log(`Base string: ${baseString}`);
    this.logger.log(`Partner Key (first 20 chars): ${this.partnerKey?.substring(0, 20)}...`);
    this.logger.log(`Signature: ${sign}`);
    this.logger.log(`Redirect URI: ${this.redirectUri}`);

    const params = new URLSearchParams({
      partner_id: this.partnerId,
      redirect: this.redirectUri,
      sign,
      timestamp: timestamp.toString(),
    });

    const fullUrl = `${this.apiHost}${path}?${params.toString()}`;
    this.logger.log(`Full URL: ${fullUrl}`);

    return {
      url: fullUrl,
      state: finalState,
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    shopId: string,
  ): Promise<ShopeeTokenResponse> {
    try {
      const path = '/api/v2/auth/token/get';
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);
      const shopIdInt = parseInt(shopId);

      // Generate signature without access_token for token exchange
      const baseString = `${partnerId}${path}${timestamp}`;
      const hmac = createHmac('sha256', this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest('hex');

      this.logger.log('=== Exchanging code for token - REQUEST ===');
      this.logger.log(`URL: ${this.apiHost}${path}`);
      this.logger.log('Body:', {
        code: `${code?.substring(0, 20)}...`,
        shop_id: shopIdInt,
        partner_id: partnerId,
      });

      const response = await axios.post(
        `${this.apiHost}${path}`,
        {
          code,
          shop_id: shopIdInt,
          partner_id: partnerId,
        },
        {
          params: {
            partner_id: partnerId,
            timestamp,
            sign,
          },
        },
      );

      this.logger.log('=== Token exchange - RESPONSE ===');
      this.logger.log('Status:', response.status);
      this.logger.log('Response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('❌ Shopee OAuth ERROR:', response.data);
        throw new BadRequestException(
          `Shopee OAuth error: ${response.data.message || response.data.error}`,
        );
      }

      const tokenData = response.data;

      if (!tokenData.access_token) {
        throw new BadRequestException('Shopee OAuth response missing access_token');
      }

      this.logger.log('✅ Token exchange SUCCESS');
      this.logger.log(`  Access token: ${tokenData.access_token?.substring(0, 30)}...`);
      this.logger.log(`  Refresh token: ${tokenData.refresh_token?.substring(0, 30)}...`);
      this.logger.log(`  Expires in: ${tokenData.expire_in} seconds`);

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expire_in: tokenData.expire_in,
        shop_id: tokenData.shop_id,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to exchange authorization code');
    }
  }

  /**
   * Get shop information
   */
  async getShopInfo(accessToken: string, shopId: number): Promise<ShopeeShopInfo> {
    try {
      const path = '/api/v2/shop/get_shop_info';
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);

      // Generate signature with access_token and shop_id
      const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
      const hmac = createHmac('sha256', this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest('hex');

      const response = await axios.get(`${this.apiHost}${path}`, {
        params: {
          partner_id: partnerId,
          shop_id: shopId,
          timestamp,
          access_token: accessToken,
          sign,
        },
      });

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get shop info: ${response.data.message}`,
        );
      }

      const shopData = response.data.response;
      return {
        shop_id: shopData.shop_id,
        shop_name: shopData.shop_name,
        region: shopData.region,
        status: shopData.status,
        logo: shopData.shop_logo,
      };
    } catch (error) {
      this.logger.error('Failed to get shop info', error);
      throw new BadRequestException('Failed to fetch Shopee shop information');
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    shopId: number,
  ): Promise<ShopeeRefreshTokenResponse> {
    try {
      const path = '/api/v2/auth/access_token/get';
      const timestamp = Math.floor(Date.now() / 1000);
      const partnerId = parseInt(this.partnerId);

      // Generate signature without access_token
      const baseString = `${partnerId}${path}${timestamp}${shopId}`;
      const hmac = createHmac('sha256', this.partnerKey);
      hmac.update(baseString);
      const sign = hmac.digest('hex');

      this.logger.log('=== Refreshing Shopee access token - REQUEST ===');
      this.logger.log(`URL: ${this.apiHost}${path}`);

      const response = await axios.post(
        `${this.apiHost}${path}`,
        {
          refresh_token: refreshToken,
          shop_id: shopId,
          partner_id: partnerId,
        },
        {
          params: {
            partner_id: partnerId,
            timestamp,
            sign,
          },
        },
      );

      this.logger.log('=== Token refresh - RESPONSE ===');
      this.logger.log(JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('Shopee token refresh ERROR:', response.data);
        throw new BadRequestException(
          `Shopee token refresh error: ${response.data.message || response.data.error}`,
        );
      }

      this.logger.log('Token refresh SUCCESS');
      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expire_in: response.data.expire_in,
        shop_id: response.data.shop_id,
      };
    } catch (error) {
      this.logger.error('Failed to refresh token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to refresh Shopee access token');
    }
  }

  /**
   * Save platform connection to database
   */
  async savePlatformConnection(
    userId: string,
    tokenResponse: ShopeeTokenResponse,
    shopInfo: ShopeeShopInfo,
  ): Promise<PlatformConnectionDocument> {
    if (!tokenResponse.access_token) {
      this.logger.error('❌ Cannot save platform connection: missing access_token');
      throw new BadRequestException('Invalid token response: missing access_token');
    }

    const expiresAt = new Date(Date.now() + tokenResponse.expire_in * 1000);

    this.logger.log('=== Saving platform connection ===');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Shop ID: ${shopInfo.shop_id}`);
    this.logger.log(`Shop Name: ${shopInfo.shop_name}`);
    this.logger.log(`Expires At: ${expiresAt}`);

    // Check if THIS USER already connected THIS SPECIFIC shop
    let existing = await this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform: 'shopee',
        platformAccountId: shopInfo.shop_id.toString(),
      })
      .exec();

    if (existing) {
      // Update existing connection
      this.logger.log(`Found existing connection: ${existing._id}`);

      existing.platformAccountName = shopInfo.shop_name;
      existing.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      };
      existing.status = 'active';
      existing.metadata = {
        ...existing.metadata,
        shopId: shopInfo.shop_id.toString(),
        region: shopInfo.region,
        logo: shopInfo.logo,
      };
      existing.lastSyncAt = new Date();

      this.logger.log(`✅ Updated existing connection for user ${userId} and shop ${shopInfo.shop_id}`);
      return existing.save();
    }

    // Create new connection
    this.logger.log(
      `Creating new connection for user ${userId} and shop ${shopInfo.shop_id}`,
    );
    return this.platformConnectionModel.create({
      userId: new Types.ObjectId(userId),
      platform: 'shopee',
      platformAccountId: shopInfo.shop_id.toString(),
      platformAccountName: shopInfo.shop_name,
      credentials: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      },
      status: 'active',
      metadata: {
        shopId: shopInfo.shop_id.toString(),
        region: shopInfo.region,
        logo: shopInfo.logo,
      },
      lastSyncAt: new Date(),
    });
  }

  /**
   * Ensure valid access token (refresh if needed)
   */
  async ensureFreshToken(
    platformConnection: PlatformConnectionDocument,
  ): Promise<string> {
    const now = new Date();
    const expiresAt = platformConnection.credentials.expiresAt;
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    this.logger.log('=== ensureFreshToken check ===');
    this.logger.log(`Platform Connection ID: ${platformConnection._id}`);
    this.logger.log(`Shop ID: ${platformConnection.platformAccountId}`);
    this.logger.log(`Token expires at: ${expiresAt}`);
    this.logger.log(`Current time: ${now}`);

    // Check if token is still valid
    if (expiresAt && now.getTime() < new Date(expiresAt).getTime() - bufferTime) {
      this.logger.log('✅ Access token is still valid');
      return platformConnection.credentials.accessToken;
    }

    // Token expired or will expire soon, refresh it
    this.logger.log('⚠️ Access token expired or expiring soon, refreshing...');

    try {
      const shopId = parseInt(platformConnection.platformAccountId);
      const tokenResponse = await this.refreshToken(
        platformConnection.credentials.refreshToken,
        shopId,
      );

      // Update platform connection with new tokens
      platformConnection.credentials.accessToken = tokenResponse.access_token;
      platformConnection.credentials.refreshToken = tokenResponse.refresh_token;
      platformConnection.credentials.expiresAt = new Date(
        Date.now() + tokenResponse.expire_in * 1000,
      );
      await platformConnection.save();

      this.logger.log('✅ Fresh token obtained and saved');
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('❌ Token refresh FAILED');

      // Mark platform connection as error status
      platformConnection.status = 'error';
      platformConnection.metadata = {
        ...platformConnection.metadata,
        error: 'Refresh token expired',
        lastError: new Date(),
      };
      await platformConnection.save();

      throw new BadRequestException(
        'Refresh token has expired. Please reconnect your Shopee shop.',
      );
    }
  }
}
