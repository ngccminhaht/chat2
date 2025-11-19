import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import axios from 'axios';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import {
  FacebookTokenResponse,
  FacebookPageInfo,
  FacebookUserInfo,
} from './dto/facebook-oauth.dto';

@Injectable()
export class FacebookOAuthService {
  private readonly logger = new Logger(FacebookOAuthService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly graphApiVersion: string = 'v18.0';

  constructor(
    private configService: ConfigService,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
  ) {
    this.appId = this.configService.get<string>('FACEBOOK_APP_ID');
    this.appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');
    this.redirectUri = this.configService.get<string>('FACEBOOK_REDIRECT_URI');
  }

  /**
   * Generate Facebook OAuth authorization URL (Dialog endpoint)
   * Scopes:
   * - pages_messaging: Send/receive messages on behalf of page
   * - pages_read_engagement: Read page engagement data
   * - pages_read_user_content: Read user-generated content on pages
   * - pages_manage_metadata: Manage page metadata (required for page selection)
   * - pages_show_list: Show page list in OAuth dialog (allows user to select pages)
   * Reference: https://developers.facebook.com/docs/permissions/reference/pages_messaging/
   */
  getAuthorizationUrl(state?: string): {
    url: string;
    state: string;
  } {
    const finalState = state || randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'pages_manage_metadata,pages_messaging,pages_read_engagement,pages_read_user_content',
      state: finalState,
      auth_type: 'rerequest', // Force re-authorization to show page selector
    });

    return {
      url: `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?${params.toString()}`,
      state: finalState,
    };
  }

  /**
   * Exchange authorization code for user access token
   */
  async exchangeCodeForToken(code: string): Promise<FacebookTokenResponse> {
    try {
      this.logger.log('=== Exchanging Facebook code for token - REQUEST ===');
      this.logger.log('URL: https://graph.instagram.com/' + this.graphApiVersion + '/oauth/access_token');
      this.logger.log('Method: POST');
      this.logger.log('Body params:', {
        client_id: this.appId,
        client_secret: `${this.appSecret?.substring(0, 10)}...`,
        redirect_uri: this.redirectUri,
        code: `${code?.substring(0, 20)}...`,
      });

      const params = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code,
      });

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.logger.log('=== Exchanging Facebook code for token - RESPONSE ===');
      this.logger.log('Status:', response.status);
      this.logger.log('Full response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('❌ Facebook OAuth ERROR in response:');
        this.logger.error(`  Error type: ${response.data.error.type}`);
        this.logger.error(`  Error message: ${response.data.error.message}`);
        throw new BadRequestException(
          `Facebook OAuth error: ${response.data.error.message}`,
        );
      }

      // Validate response has required fields
      if (!response.data.access_token) {
        this.logger.error('❌ Response missing access_token!');
        throw new BadRequestException('Facebook OAuth response missing access_token');
      }

      this.logger.log('✅ Token exchange SUCCESS:');
      this.logger.log(`  Access token: ${response.data.access_token?.substring(0, 30)}... (length: ${response.data.access_token?.length})`);
      this.logger.log(`  Token type: ${response.data.token_type}`);
      this.logger.log(`  Expires in: ${response.data.expires_in || 'Not specified'}`);

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new BadRequestException('Failed to exchange authorization code');
    }
  }

  /**
   * Get list of pages for the authenticated user
   */
  async getPages(accessToken: string): Promise<FacebookPageInfo[]> {
    try {
      this.logger.log('Fetching Facebook pages list...');

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/me/accounts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,access_token,picture.width(100).height(100)',
          },
        }
      );

      this.logger.log('Facebook pages response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get pages: ${response.data.error.message}`,
        );
      }

      if (!response.data.data || response.data.data.length === 0) {
        this.logger.warn('User has no Facebook pages');
        return [];
      }

      this.logger.log(`✅ Retrieved ${response.data.data.length} Facebook pages`);
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get Facebook pages', error);
      throw new BadRequestException('Failed to fetch Facebook pages');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken: string): Promise<FacebookUserInfo> {
    try {
      this.logger.log('Fetching Facebook user profile...');

      const response = await axios.get(
        `https://graph.facebook.com/${this.graphApiVersion}/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,email,picture.width(100).height(100)',
          },
        }
      );

      if (response.data.error) {
        throw new BadRequestException(
          `Failed to get user profile: ${response.data.error.message}`,
        );
      }

      this.logger.log(`✅ Retrieved user profile: ${response.data.name}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user profile', error);
      throw new BadRequestException('Failed to fetch Facebook user profile');
    }
  }

  /**
   * Save platform connection for a Facebook page
   * Allows multiple pages per user
   */
  async savePlatformConnection(
    userId: string,
    pageInfo: FacebookPageInfo,
  ): Promise<PlatformConnectionDocument> {
    if (!pageInfo.access_token) {
      this.logger.error('❌ Page does not have access_token');
      throw new BadRequestException('Page access token not available');
    }

    if (!pageInfo.id || !pageInfo.name) {
      this.logger.error('❌ Page missing required fields');
      throw new BadRequestException('Page missing required fields');
    }

    this.logger.log('=== Saving Facebook page platform connection ===');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Page ID: ${pageInfo.id}`);
    this.logger.log(`Page Name: ${pageInfo.name}`);
    this.logger.log(`Page Access Token: ${pageInfo.access_token?.substring(0, 30)}... (length: ${pageInfo.access_token?.length})`);

    // Check if THIS USER already connected THIS SPECIFIC PAGE
    let existing = await this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform: 'facebook',
        platformAccountId: pageInfo.id,
      })
      .exec();

    if (existing) {
      // Update existing connection
      this.logger.log(`Found existing connection: ${existing._id}`);

      existing.platformAccountName = pageInfo.name;
      existing.credentials = {
        accessToken: pageInfo.access_token,
        // Note: Facebook page tokens don't expire unless page ownership changes
      };
      existing.status = 'active';
      existing.metadata = {
        ...existing.metadata,
        pageId: pageInfo.id,
        pageName: pageInfo.name,
        picture: pageInfo.picture,
        category: pageInfo.category,
      };
      existing.lastSyncAt = new Date();

      this.logger.log(`✅ Updated existing connection for user ${userId} and page ${pageInfo.id}`);

      return existing.save();
    }

    // Create new connection (allows multiple pages per user)
    this.logger.log(
      `Creating new connection for user ${userId} and page ${pageInfo.id}`,
    );

    return this.platformConnectionModel.create({
      userId: new Types.ObjectId(userId),
      platform: 'facebook',
      platformAccountId: pageInfo.id,
      platformAccountName: pageInfo.name,
      credentials: {
        accessToken: pageInfo.access_token,
      },
      status: 'active',
      metadata: {
        pageId: pageInfo.id,
        pageName: pageInfo.name,
        picture: pageInfo.picture,
        category: pageInfo.category,
      },
      lastSyncAt: new Date(),
    });
  }

  /**
   * Sync all pages for a user (requires new OAuth authorization)
   * This method is used when user wants to refresh their page list
   * Returns the authorization URL for user to re-authenticate
   */
  async syncPagesForUser(userId: string): Promise<{ authUrl: string; state: string }> {
    this.logger.log(`Initiating page sync for user ${userId}`);

    // Generate new OAuth URL with rerequest to force showing all permissions
    const { url, state } = this.getAuthorizationUrl();

    return {
      authUrl: url,
      state,
    };
  }

  /**
   * Get sync status for user's Facebook pages
   * Returns list of connected pages and last sync time
   */
  async getSyncStatus(userId: string): Promise<{
    connectedPages: number;
    lastSyncAt: Date | null;
  }> {
    const connections = await this.platformConnectionModel
      .find({
        userId: new Types.ObjectId(userId),
        platform: 'facebook',
        status: 'active',
      })
      .exec();

    const lastSyncAt = connections.length > 0
      ? connections.reduce((latest, conn) => {
          return conn.lastSyncAt > latest ? conn.lastSyncAt : latest;
        }, connections[0].lastSyncAt)
      : null;

    return {
      connectedPages: connections.length,
      lastSyncAt,
    };
  }

  /**
   * Sync conversations from Facebook page (placeholder implementation)
   * Facebook doesn't provide a list of recent conversations via Graph API,
   * so conversations are created when webhooks arrive
   */
  async syncConversations(
    platformConnectionId: string,
  ): Promise<number> {
    try {
      this.logger.log(
        `Conversation sync for Facebook connection ${platformConnectionId}`,
      );

      // Facebook doesn't expose a way to fetch historical conversations
      // Conversations are created when incoming webhook messages arrive
      this.logger.log('Note: Facebook conversations are synced via webhooks');

      return 0;
    } catch (error) {
      this.logger.error('Failed to sync conversations:', error);
      throw error;
    }
  }

  /**
   * Send text message to Facebook user
   */
  async sendTextMessage(
    pageAccessToken: string,
    recipientId: string,
    text: string,
  ): Promise<{ message_id: string }> {
    try {
      this.logger.log(`Sending text message to Facebook user ${recipientId}`);

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
        {
          recipient: {
            id: recipientId,
          },
          message: {
            text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
          },
        }
      );

      if (response.data.error) {
        this.logger.error('Facebook send message error:', response.data.error);
        throw new BadRequestException(
          `Failed to send Facebook message: ${response.data.error.message}`,
        );
      }

      this.logger.log(`✅ Message sent successfully: ${response.data.message_id}`);

      return {
        message_id: response.data.message_id,
      };
    } catch (error) {
      if (error.response) {
        this.logger.error('Facebook API error response:', {
          status: error.response.status,
          data: error.response.data,
        });
      } else {
        this.logger.error('Failed to send message:', error.message);
      }
      throw new BadRequestException('Failed to send message to Facebook');
    }
  }
}
