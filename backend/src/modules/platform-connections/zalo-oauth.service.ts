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
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
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
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
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

      // Try OA-specific endpoint with secret_key header
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

      this.logger.log('Raw Zalo API response:', JSON.stringify(response.data, null, 2));

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
   * Get recent chat list from Zalo OA
   */
  async getRecentChats(
    accessToken: string,
    offset: number = 0,
    count: number = 10,
  ): Promise<any> {
    try {
      // Zalo API limit: maximum count is 10
      if (count > 10) {
        this.logger.warn(`Count ${count} exceeds Zalo limit, using max 10`);
        count = 10;
      }

      // Zalo API requires 'data' parameter as JSON string
      const data = JSON.stringify({ offset, count });
      const url = `https://openapi.zalo.me/v2.0/oa/listrecentchat?data=${encodeURIComponent(data)}`;

      this.logger.log('Calling Zalo listrecentchat API:', {
        url,
        data: { offset, count },
        hasToken: !!accessToken
      });

      const response = await axios.get(url, {
        headers: {
          access_token: accessToken,
        },
      });

      this.logger.log('Zalo recent chats response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('Zalo API error response:', response.data);
        throw new BadRequestException(
          `Failed to get recent chats: ${response.data.message || response.data.error}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (error.response) {
        this.logger.error('Zalo API error response:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers,
        });
      } else {
        this.logger.error('Failed to get recent chats:', error.message);
      }
      throw new BadRequestException('Failed to fetch recent chats from Zalo');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken: string, userId: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        user_id: userId,
      });

      const response = await axios.get(
        `https://openapi.zalo.me/v2.0/oa/getprofile?${params.toString()}`,
        {
          headers: {
            access_token: accessToken,
          },
        },
      );

      if (response.data.error) {
        this.logger.warn(
          `Failed to get user profile for ${userId}: ${response.data.message}`,
        );
        return null;
      }

      return response.data.data;
    } catch (error) {
      this.logger.warn(`Failed to get user profile for ${userId}`, error);
      return null;
    }
  }

  /**
   * Sync conversations from Zalo recent chats
   */
  async syncConversations(
    platformConnectionId: string,
    accessToken: string,
  ): Promise<number> {
    try {
      this.logger.log(
        `Starting conversation sync for connection ${platformConnectionId}`,
      );

      // Get recent chats from Zalo (max 10 per Zalo API limit)
      const recentChats = await this.getRecentChats(accessToken, 0, 10);

      if (!recentChats || !recentChats.users) {
        this.logger.warn('No recent chats found');
        return 0;
      }

      let syncedCount = 0;

      // Process each recent chat
      for (const chat of recentChats.users) {
        try {
          const userIdByApp = chat.user_id;

          // Check if conversation already exists
          const existing = await this.conversationModel
            .findOne({
              platform: 'zalo',
              platformConversationId: userIdByApp,
              platformConnectionId: new Types.ObjectId(platformConnectionId),
            })
            .exec();

          if (existing) {
            this.logger.log(
              `Conversation already exists for user ${userIdByApp}`,
            );
            continue;
          }

          // Get user profile for additional info
          const userProfile = await this.getUserProfile(accessToken, userIdByApp);

          const displayName = userProfile?.display_name || `Zalo User ${userIdByApp.substring(0, 8)}`;
          const avatar = userProfile?.avatar;

          // Create new conversation
          await this.conversationModel.create({
            platform: 'zalo',
            platformConversationId: userIdByApp,
            platformConnectionId: new Types.ObjectId(platformConnectionId),
            participants: [
              {
                platformUserId: userIdByApp,
                name: displayName,
                avatar: avatar,
                role: 'customer',
              },
            ],
            status: 'open',
            unreadCount: 0,
            metadata: {
              syncedFromRecentChats: true,
            },
          });

          syncedCount++;
          this.logger.log(`Created conversation for user ${userIdByApp}`);
        } catch (error) {
          this.logger.error(
            `Failed to sync conversation for user ${chat.user_id}:`,
            error,
          );
          // Continue with next chat even if one fails
        }
      }

      this.logger.log(
        `Conversation sync completed. Synced ${syncedCount} conversations.`,
      );
      return syncedCount;
    } catch (error) {
      this.logger.error('Failed to sync conversations:', error);
      throw error;
    }
  }

  /**
   * Save platform connection to database
   * Allows multiple accounts per platform per user
   */
  async savePlatformConnection(
    userId: string,
    tokenResponse: ZaloTokenResponse,
    oaInfo: ZaloOAInfo,
  ): Promise<PlatformConnectionDocument> {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Check if THIS USER already connected THIS SPECIFIC OA
    const existing = await this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform: 'zalo',
        platformAccountId: oaInfo.oa_id,
      })
      .exec();

    if (existing) {
      // Update existing connection (refresh tokens)
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

      this.logger.log(
        `Updated existing connection for user ${userId} and OA ${oaInfo.oa_id}`,
      );
      return existing.save();
    }

    // Create new connection (allows multiple OAs per user)
    this.logger.log(
      `Creating new connection for user ${userId} and OA ${oaInfo.oa_id}`,
    );
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
