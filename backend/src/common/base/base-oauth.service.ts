/**
 * Base OAuth Service
 * Abstract class to eliminate duplication across platform OAuth services
 */

import { Logger } from '@nestjs/common';
import { EnvService } from '../env';
import axios, { AxiosInstance } from 'axios';
import { Model } from 'mongoose';
import {
  Platform,
  ConnectionStatus,
  PLATFORM_OAUTH_SCOPES,
} from '../constants';
import {
  OAuthCallbackDto,
  OAuthTokenResponse,
  CreatePlatformConnectionDto,
} from '../types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

/**
 * Abstract base class for OAuth flows
 */
export abstract class BaseOAuthService {
  protected readonly logger: Logger;
  protected readonly httpClient: AxiosInstance;
  protected readonly config: OAuthConfig;

  constructor(
    protected readonly platform: Platform,
    protected readonly envService: EnvService,
    protected readonly platformConnectionModel: Model<any>,
  ) {
    this.logger = new Logger(`${platform}OAuthService`);
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load OAuth config from environment
    this.config = this.loadOAuthConfig();
  }

  /**
   * Abstract methods to be implemented by platform-specific services
   */
  abstract getAuthorizationUrl(state?: string): string;
  abstract exchangeCodeForToken(code: string): Promise<OAuthTokenResponse>;
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>;
  abstract getAccountInfo(accessToken: string): Promise<{
    id: string;
    name: string;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Common: Load OAuth configuration from environment
   */
  protected loadOAuthConfig(): OAuthConfig {
    const platformUpper = this.platform.toUpperCase();

    const clientId = this.envService.get(`${platformUpper}_APP_ID` as any);
    const clientSecret = this.envService.get(`${platformUpper}_APP_SECRET` as any);
    const redirectUri = this.envService.get(`${platformUpper}_REDIRECT_URI` as any);

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        `Missing OAuth configuration for ${this.platform}. ` +
          `Required: ${platformUpper}_APP_ID, ${platformUpper}_APP_SECRET, ${platformUpper}_REDIRECT_URI`,
      );
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      scope: PLATFORM_OAUTH_SCOPES[this.platform],
    };
  }

  /**
   * Common: Handle OAuth callback
   * Template method that orchestrates the OAuth flow
   */
  async handleCallback(
    callbackDto: OAuthCallbackDto,
    organizationId: string,
  ): Promise<{ connectionId: string; accountName: string }> {
    const { code, error, error_description } = callbackDto;

    // Check for OAuth errors
    if (error) {
      this.logger.error(`OAuth error: ${error} - ${error_description}`);
      throw new Error(`OAuth failed: ${error_description || error}`);
    }

    if (!code) {
      throw new Error('Authorization code missing');
    }

    try {
      // Step 1: Exchange code for token
      this.logger.log('Exchanging authorization code for access token...');
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Step 2: Get account info
      this.logger.log('Fetching account information...');
      const accountInfo = await this.getAccountInfo(
        tokenResponse.access_token,
      );

      // Step 3: Calculate token expiration
      const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : undefined;

      // Step 4: Upsert platform connection
      const connectionData: Partial<CreatePlatformConnectionDto> = {
        organizationId,
        platform: this.platform,
        platformAccountId: accountInfo.id,
        platformAccountName: accountInfo.name,
        credentials: {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
          scopes: tokenResponse.scope?.split(','),
        },
        status: ConnectionStatus.ACTIVE,
        metadata: accountInfo.metadata || {},
      };

      const connection = await this.upsertPlatformConnection(connectionData);

      // Step 5: Platform-specific post-connection setup
      await this.postConnectionSetup(connection, tokenResponse.access_token);

      this.logger.log(
        `OAuth completed successfully for ${accountInfo.name} (${accountInfo.id})`,
      );

      return {
        connectionId: connection._id.toString(),
        accountName: accountInfo.name,
      };
    } catch (error) {
      this.logger.error('OAuth callback failed:', error);
      throw new Error(`Failed to complete OAuth: ${error.message}`);
    }
  }

  /**
   * Common: Upsert platform connection
   */
  protected async upsertPlatformConnection(
    data: Partial<CreatePlatformConnectionDto>,
  ) {
    const existing = await this.platformConnectionModel
      .findOne({
        organizationId: data.organizationId,
        platform: data.platform,
        platformAccountId: data.platformAccountId,
      })
      .exec();

    if (existing) {
      // Update existing connection
      Object.assign(existing, {
        platformAccountName: data.platformAccountName,
        credentials: data.credentials,
        status: data.status,
        metadata: {
          ...existing.metadata,
          ...data.metadata,
        },
        lastSyncAt: new Date(),
      });
      return existing.save();
    } else {
      // Create new connection
      return this.platformConnectionModel.create({
        ...data,
        lastSyncAt: new Date(),
      });
    }
  }

  /**
   * Hook method: Platform-specific setup after OAuth
   * Default implementation is no-op, override in subclasses
   */
  protected async postConnectionSetup(
    connection: any,
    accessToken: string,
  ): Promise<void> {
    // Override in subclass if needed (e.g., subscribe to webhooks)
  }

  /**
   * Common: Disconnect platform
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = await this.platformConnectionModel.findById(connectionId);

    if (!connection) {
      throw new Error('Connection not found');
    }

    // Platform-specific cleanup
    await this.preDisconnectCleanup(connection);

    // Mark as inactive
    connection.status = ConnectionStatus.INACTIVE;
    await connection.save();

    this.logger.log(`Disconnected ${this.platform} connection: ${connectionId}`);
  }

  /**
   * Hook method: Platform-specific cleanup before disconnect
   * Default implementation is no-op, override in subclasses
   */
  protected async preDisconnectCleanup(connection: any): Promise<void> {
    // Override in subclass if needed (e.g., unsubscribe from webhooks)
  }

  /**
   * Utility: Mask sensitive tokens for logging
   */
  protected maskToken(token: string, visibleChars: number = 8): string {
    if (!token) return '[empty]';
    if (token.length <= visibleChars) return '***';
    return `${token.substring(0, visibleChars)}...[${token.length} chars]`;
  }
}
