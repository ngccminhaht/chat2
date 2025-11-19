import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EnvService } from '@/common/env';
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
    private envService: EnvService,
    @InjectModel(PlatformConnection.name)
    private platformConnectionModel: Model<PlatformConnectionDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
  ) {
    this.appId = this.envService.get('ZALO_APP_ID');
    this.appSecret = this.envService.get('ZALO_APP_SECRET');
    this.redirectUri = this.envService.get('ZALO_REDIRECT_URI');
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

      this.logger.log('=== Exchanging code for token - REQUEST ===');
      this.logger.log('URL: https://oauth.zaloapp.com/v4/oa/access_token');
      this.logger.log('Method: POST');
      this.logger.log('Headers:', {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': `${this.appSecret?.substring(0, 10)}...`,
      });
      this.logger.log('Body params:', {
        app_id: this.appId,
        code: `${code?.substring(0, 20)}...`,
        code_verifier: `${codeVerifier?.substring(0, 20)}...`,
        grant_type: 'authorization_code',
        oa_id: oaId || 'NOT PROVIDED',
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

      this.logger.log('=== Exchanging code for token - RESPONSE ===');
      this.logger.log('Status:', response.status);
      this.logger.log('Full response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('❌ Zalo OAuth ERROR in response:');
        this.logger.error(`  Error code: ${response.data.error}`);
        this.logger.error(`  Error name: ${response.data.error_name}`);
        this.logger.error(`  Error description: ${response.data.error_description}`);
        this.logger.error(`  Ref doc: ${response.data.ref_doc}`);
        throw new BadRequestException(
          `Zalo OAuth error: ${response.data.error_description || response.data.error}`,
        );
      }

      // Validate response has required tokens
      if (!response.data.access_token) {
        this.logger.error('❌ Response missing access_token!');
        throw new BadRequestException('Zalo OAuth response missing access_token');
      }

      if (!response.data.refresh_token) {
        this.logger.error('⚠️ WARNING: Response missing refresh_token!');
        this.logger.error('This will cause issues when the access token expires.');
        this.logger.error('Full response:', JSON.stringify(response.data, null, 2));
      }

      this.logger.log('✅ Token exchange SUCCESS:');
      this.logger.log(`  Access token: ${response.data.access_token?.substring(0, 30)}... (length: ${response.data.access_token?.length})`);
      this.logger.log(`  Refresh token: ${response.data.refresh_token ? response.data.refresh_token.substring(0, 30) + '... (length: ' + response.data.refresh_token.length + ')' : 'NOT PROVIDED ❌'}`);
      this.logger.log(`  Expires in: ${response.data.expires_in} seconds (${Math.floor(response.data.expires_in / 3600)} hours)`);

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
      // Get platform connection to fetch OA ID
      const platformConnection = await this.platformConnectionModel
        .findById(platformConnectionId)
        .exec();

      if (!platformConnection) {
        throw new BadRequestException('Platform connection not found');
      }

      const oaId = platformConnection.platformAccountId;

      this.logger.log(
        `Starting conversation sync for connection ${platformConnectionId} (OA: ${oaId})`,
      );

      // Get recent chats from Zalo (max 10 per Zalo API limit)
      const recentChats = await this.getRecentChats(accessToken, 0, 10);

      this.logger.log('Recent chats response:', JSON.stringify(recentChats, null, 2));

      // Zalo returns a flat array of messages, not grouped by user
      // Response structure: [{ from_id, from_display_name, from_avatar, message, time, src, ... }]
      if (!Array.isArray(recentChats) || recentChats.length === 0) {
        this.logger.warn('No recent chats found or invalid structure:', {
          isArray: Array.isArray(recentChats),
          length: recentChats?.length,
          type: typeof recentChats,
        });
        return 0;
      }

      // Group messages by customer user ID
      // src=1: message from customer to OA (use from_id)
      // src=0: message from OA to customer (use to_id)
      const conversationsMap = new Map<string, any>();

      for (const message of recentChats) {
        // Determine the customer user ID based on message direction
        const customerId = message.src === 1 ? message.from_id : message.to_id;
        const customerName = message.src === 1 ? message.from_display_name : message.to_display_name;
        const customerAvatar = message.src === 1 ? message.from_avatar : message.to_avatar;

        // Keep the most recent message for each conversation
        if (!conversationsMap.has(customerId) || message.time > conversationsMap.get(customerId).time) {
          conversationsMap.set(customerId, {
            userId: customerId,
            displayName: customerName,
            avatar: customerAvatar,
            lastMessage: {
              text: message.message || `[${message.type}]`,
              time: message.time,
              messageId: message.message_id,
            },
          });
        }
      }

      this.logger.log(
        `Grouped ${conversationsMap.size} unique conversations from ${recentChats.length} messages`,
      );

      let syncedCount = 0;

      // Process each unique conversation
      for (const [customerId, chat] of conversationsMap) {
        try {
          // Use sender.id (global user ID) for conversation key
          // Composite key format: ${senderId}_${oaId}
          const conversationKey = `${customerId}_${oaId}`;

          this.logger.log(
            `Processing conversation for user ${customerId}, key: ${conversationKey}`,
          );

          // Check if conversation already exists (using composite key)
          const existing = await this.conversationModel
            .findOne({
              platform: 'zalo',
              platformConversationId: conversationKey,
            })
            .exec();

          if (existing) {
            this.logger.log(
              `Conversation already exists for key ${conversationKey}`,
            );
            continue;
          }

          // Create new conversation with composite key (consistent with webhook)
          const displayName = chat.displayName || `Zalo User ${customerId.substring(0, Math.min(8, customerId.length))}`;

          await this.conversationModel.create({
            platform: 'zalo',
            platformConversationId: conversationKey,
            platformConnectionId: new Types.ObjectId(platformConnectionId),
            platformAccountId: oaId, // Store OA ID for easy querying
            participants: [
              {
                platformUserId: customerId,
                name: displayName,
                avatar: chat.avatar,
                role: 'customer',
              },
            ],
            status: 'open',
            unreadCount: 0,
            lastMessage: {
              text: chat.lastMessage.text,
              timestamp: new Date(chat.lastMessage.time),
              senderId: customerId,
              messageId: new Types.ObjectId(), // Temporary ID
            },
            metadata: {
              syncedFromRecentChats: true,
              lastMessageId: chat.lastMessage.messageId,
            },
          });

          syncedCount++;
          this.logger.log(`Created conversation for user ${customerId} (${displayName})`);
        } catch (error) {
          this.logger.error(
            `Failed to sync conversation for user ${customerId}:`,
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
    // Validate token response before saving
    if (!tokenResponse.access_token) {
      this.logger.error('❌ Cannot save platform connection: missing access_token');
      throw new BadRequestException('Invalid token response: missing access_token');
    }

    if (!tokenResponse.refresh_token) {
      this.logger.warn('⚠️ Token response missing refresh_token - connection will fail when access token expires!');
      this.logger.warn('Token response:', JSON.stringify(tokenResponse, null, 2));
    }

    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    this.logger.log('=== Saving platform connection ===');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`OA ID: ${oaInfo.oa_id}`);
    this.logger.log(`OA Name: ${oaInfo.name}`);
    this.logger.log(`Access Token: ${tokenResponse.access_token?.substring(0, 30)}... (length: ${tokenResponse.access_token?.length})`);
    this.logger.log(`Refresh Token: ${tokenResponse.refresh_token ? tokenResponse.refresh_token.substring(0, 30) + '... (length: ' + tokenResponse.refresh_token.length + ')' : 'MISSING ❌'}`);
    this.logger.log(`Expires At: ${expiresAt}`);

    // Check if THIS USER already connected THIS SPECIFIC OA
    let existing = await this.platformConnectionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        platform: 'zalo',
        platformAccountId: oaInfo.oa_id,
      })
      .exec();

    // Also check for placeholder connection created from webhook (no userId)
    if (!existing) {
      existing = await this.platformConnectionModel
        .findOne({
          platform: 'zalo',
          platformAccountId: oaInfo.oa_id,
          'metadata.createdFromWebhook': true,
        })
        .exec();

      if (existing) {
        this.logger.log(
          `Found placeholder connection from webhook, updating with user ${userId}`,
        );
      }
    }

    if (existing) {
      // Update existing connection (refresh tokens and activate)
      this.logger.log(`Found existing connection: ${existing._id}`);
      this.logger.log(`Previous status: ${existing.status}`);
      this.logger.log(`Previous refresh token: ${existing.credentials.refreshToken?.substring(0, 30)}... (length: ${existing.credentials.refreshToken?.length})`);

      existing.userId = new Types.ObjectId(userId);
      existing.platformAccountName = oaInfo.name;
      existing.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      };
      existing.status = 'active';
      existing.metadata = {
        ...existing.metadata,
        oaId: oaInfo.oa_id,
        description: oaInfo.description,
        avatar: oaInfo.avatar,
        createdFromWebhook: undefined, // Remove webhook flag
      };
      existing.lastSyncAt = new Date();

      this.logger.log(`✅ Updated existing connection for user ${userId} and OA ${oaInfo.oa_id}`);
      this.logger.log(`New status: ${existing.status}`);
      this.logger.log(`New refresh token: ${existing.credentials.refreshToken?.substring(0, 30)}... (length: ${existing.credentials.refreshToken?.length})`);

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
   * Refresh OA access token
   * Uses Zalo OA-specific endpoint with secret_key header
   */
  async refreshToken(refreshToken: string): Promise<ZaloTokenResponse> {
    try {
      // Validate refresh token before attempting refresh
      if (!refreshToken || refreshToken === 'placeholder') {
        this.logger.error('❌ Invalid refresh token provided:', {
          isNull: !refreshToken,
          isPlaceholder: refreshToken === 'placeholder',
          value: refreshToken,
        });
        throw new BadRequestException('Invalid refresh token - please reconnect your Zalo OA');
      }

      // Create URL-encoded form data for OA token refresh
      const params = new URLSearchParams({
        app_id: this.appId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      this.logger.log('=== Refreshing Zalo OA access token - REQUEST ===');
      this.logger.log('URL: https://oauth.zaloapp.com/v4/oa/access_token');
      this.logger.log('Method: POST');
      this.logger.log('Headers:', {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': this.appSecret, // FULL secret for debug
      });
      this.logger.log('Body params:', {
        app_id: this.appId,
        refresh_token: refreshToken, // FULL refresh_token for debug
        grant_type: 'refresh_token',
      });
      this.logger.log('⚠️ DEBUG MODE: Showing FULL tokens above (remove in production!)');

      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'secret_key': this.appSecret,
          },
        },
      );

      // ALWAYS log response first (even if there's an error)
      this.logger.log('=== Zalo OA token refresh RAW response ===');
      this.logger.log(JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('Zalo OA token refresh ERROR in response:');
        this.logger.error(`  Error code: ${response.data.error}`);
        this.logger.error(`  Error name: ${response.data.error_name}`);
        this.logger.error(`  Error description: ${response.data.error_description}`);
        this.logger.error(`  Error reason: ${response.data.error_reason}`);
        throw new BadRequestException(
          `Zalo OA token refresh error: ${response.data.error_description || response.data.error}`,
        );
      }

      this.logger.log('Token refresh SUCCESS:');
      this.logger.log(`  Access token: ${response.data.access_token?.substring(0, 30)}...`);
      this.logger.log(`  Refresh token: ${response.data.refresh_token?.substring(0, 30)}...`);
      this.logger.log(`  Expires in: ${response.data.expires_in} seconds`);

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      // Catch axios errors (network, 4xx, 5xx)
      if (error.response) {
        this.logger.error('=== Axios error response ===');
        this.logger.error(`  Status: ${error.response.status}`);
        this.logger.error(`  Data: ${JSON.stringify(error.response.data)}`);
      } else {
        this.logger.error('Failed to refresh OA token (network error):', error.message);
      }
      throw new BadRequestException('Failed to refresh OA access token');
    }
  }

  /**
   * Wrapper to ensure valid access token before any Zalo OA API call
   * Only refreshes token if it's expired or will expire soon (within 5 minutes)
   * @param platformConnection - Platform connection document
   * @returns Valid access token (existing or refreshed)
   * @throws BadRequestException if refresh token is invalid/expired
   */
  async ensureFreshToken(
    platformConnection: PlatformConnectionDocument,
  ): Promise<string> {
    const now = new Date();
    const expiresAt = platformConnection.credentials.expiresAt;
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    this.logger.log('=== ensureFreshToken check ===');
    this.logger.log(`Platform Connection ID: ${platformConnection._id}`);
    this.logger.log(`OA ID: ${platformConnection.platformAccountId}`);
    this.logger.log(`Status: ${platformConnection.status}`);
    this.logger.log(`Current access token: ${platformConnection.credentials.accessToken?.substring(0, 30)}... (length: ${platformConnection.credentials.accessToken?.length})`);
    this.logger.log(`Current refresh token: ${platformConnection.credentials.refreshToken?.substring(0, 30)}... (length: ${platformConnection.credentials.refreshToken?.length})`);
    this.logger.log(`Token expires at: ${expiresAt}`);
    this.logger.log(`Current time: ${now}`);
    this.logger.log(`Time until expiry: ${expiresAt ? new Date(expiresAt).getTime() - now.getTime() : 'N/A'} ms`);

    // Check for placeholder tokens from webhook-created connections
    if (platformConnection.credentials.accessToken === 'placeholder' ||
        platformConnection.credentials.refreshToken === 'placeholder') {
      this.logger.error('❌ Platform connection has placeholder tokens!');
      this.logger.error('This connection was created from a webhook and needs proper authentication.');
      this.logger.error('Please reconnect your Zalo OA in Platform Connections settings.');

      // Mark as inactive
      platformConnection.status = 'pending';
      await platformConnection.save();

      throw new BadRequestException(
        'Platform connection not properly authenticated. Please reconnect your Zalo OA in settings.',
      );
    }

    // Check if token is still valid (not expired and won't expire in next 5 minutes)
    if (expiresAt && now.getTime() < new Date(expiresAt).getTime() - bufferTime) {
      this.logger.log('✅ Access token is still valid, using existing token');
      return platformConnection.credentials.accessToken;
    }

    // Token expired or will expire soon, refresh it
    this.logger.log('⚠️ Access token expired or expiring soon, refreshing...');

    try {
      const tokenResponse = await this.refreshToken(
        platformConnection.credentials.refreshToken,
      );

      // Update platform connection with new tokens
      platformConnection.credentials.accessToken = tokenResponse.access_token;
      platformConnection.credentials.refreshToken = tokenResponse.refresh_token;
      platformConnection.credentials.expiresAt = new Date(
        Date.now() + tokenResponse.expires_in * 1000,
      );
      await platformConnection.save();

      this.logger.log('Fresh token obtained and saved');
      this.logger.log(`New token expires at: ${platformConnection.credentials.expiresAt}`);
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('=== Token refresh FAILED ===');

      // Check if error is due to invalid refresh token (Zalo error -14014)
      const errorData = error.response?.data;
      this.logger.error('Error response data:', JSON.stringify(errorData, null, 2));

      if (errorData?.error === -14014) {
        this.logger.error('❌ Refresh token is invalid or expired (Zalo error -14014)');
        this.logger.error('Possible causes:');
        this.logger.error('  1. Refresh token expired (90 days limit)');
        this.logger.error('  2. User revoked app permissions');
        this.logger.error('  3. Refresh token was never properly set (placeholder token)');

        // Mark platform connection as error status
        platformConnection.status = 'error';
        platformConnection.metadata = {
          ...platformConnection.metadata,
          error: 'Refresh token expired',
          errorCode: -14014,
          lastError: new Date(),
        };
        await platformConnection.save();

        this.logger.error(`Platform connection ${platformConnection._id} marked as error status`);

        throw new BadRequestException(
          'Refresh token has expired. Please reconnect your Zalo OA in Platform Connections settings.',
        );
      }

      // Other error types
      this.logger.error('❌ Unknown error during token refresh:', error.message);
      throw error;
    }
  }

  /**
   * Send text message to Zalo user with automatic token refresh
   * @param platformConnection - Platform connection document (will be updated with new token)
   * @param recipientId - Zalo user ID to send message to
   * @param text - Message text content
   * @returns Zalo message response with message_id
   */
  async sendTextMessageWithRefresh(
    platformConnection: PlatformConnectionDocument,
    recipientId: string,
    text: string,
  ): Promise<{ message_id: string }> {
    // Ensure token is valid (refresh if needed)
    let accessToken = await this.ensureFreshToken(platformConnection);

    try {
      return await this.sendTextMessage(accessToken, recipientId, text);
    } catch (error) {
      this.logger.error('=== sendTextMessage failed, checking if we should retry ===');
      this.logger.error(`Error type: ${error.constructor.name}`);
      this.logger.error(`Has response: ${!!error.response}`);
      this.logger.error(`Response data: ${JSON.stringify(error.response?.data)}`);

      // If send fails with error -216 (invalid token), force refresh and retry once
      const errorData = error.response?.data;
      if (errorData?.error === -216) {
        this.logger.warn('🔄 Send failed with error -216 (invalid token), forcing refresh and retrying...');

        // Force refresh by setting expiresAt to past
        platformConnection.credentials.expiresAt = new Date(Date.now() - 1000);
        accessToken = await this.ensureFreshToken(platformConnection);

        this.logger.log('🔁 Retrying send with refreshed token...');
        return await this.sendTextMessage(accessToken, recipientId, text);
      }

      this.logger.error('❌ Error is not -216, rethrowing without retry');
      // Other error, rethrow
      throw error;
    }
  }

  /**
   * Send text message to Zalo user (internal method)
   * @param accessToken - Zalo OA access token
   * @param recipientId - Zalo user ID to send message to
   * @param text - Message text content
   * @returns Zalo message response with message_id
   */
  private async sendTextMessage(
    accessToken: string,
    recipientId: string,
    text: string,
  ): Promise<{ message_id: string }> {
    try {
      this.logger.log(`Sending text message to Zalo user ${recipientId} using API v3`);
      this.logger.log(`Using access token: ${accessToken?.substring(0, 30)}... (length: ${accessToken?.length})`);

      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: {
            user_id: recipientId,
          },
          message: {
            text: text,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
        },
      );

      this.logger.log('Zalo send message response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        this.logger.error('Zalo send message error:', response.data);

        // Create error with response data attached for retry logic
        const err: any = new BadRequestException(
          `Failed to send Zalo message: ${response.data.message || response.data.error}`,
        );
        err.response = { data: response.data };
        throw err;
      }

      return {
        message_id: response.data.data.message_id,
      };
    } catch (error) {
      if (error.response) {
        this.logger.error('Zalo API error response:', {
          status: error.response.status,
          data: error.response.data,
        });
        // Preserve response data for retry logic
        const err: any = new BadRequestException('Failed to send message to Zalo');
        err.response = error.response;
        throw err;
      } else if (error instanceof BadRequestException) {
        // Already a BadRequestException with response data, rethrow as-is
        throw error;
      } else {
        this.logger.error('Failed to send text message:', error.message);
        throw new BadRequestException('Failed to send message to Zalo');
      }
    }
  }
}
