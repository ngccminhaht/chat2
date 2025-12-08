import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';
import { Platform } from '@/common/constants';
import {
  IOAuthHandler,
  AuthUrlParams,
  TokenExchangeParams,
  TokenResponse,
  PlatformAccountInfo,
} from '../interfaces';

/**
 * Base OAuth handler with common functionality
 * Platform-specific handlers should extend this class
 */
export abstract class BaseOAuthHandler implements IOAuthHandler {
  protected readonly logger: Logger;
  abstract readonly platform: Platform;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Generate authorization URL
   * Must be implemented by platform-specific handlers
   */
  abstract generateAuthUrl(params: AuthUrlParams): string;

  /**
   * Exchange code for token
   * Must be implemented by platform-specific handlers
   */
  abstract exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse>;

  /**
   * Refresh token
   * Must be implemented by platform-specific handlers
   * Return null if refresh not supported
   */
  abstract refreshToken(refreshToken: string): Promise<TokenResponse | null>;

  /**
   * Get account info
   * Must be implemented by platform-specific handlers
   */
  abstract getAccountInfo(accessToken: string): Promise<PlatformAccountInfo[]>;

  /**
   * Check if PKCE is used
   * Override in platform handlers that use PKCE
   */
  usesPKCE(): boolean {
    return false;
  }

  /**
   * Generate PKCE code verifier
   * Random 43-128 character string
   */
  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   * SHA256 hash, base64url encoded
   */
  generateCodeChallenge(codeVerifier: string): string {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  /**
   * Helper: Build URL with query parameters
   */
  protected buildUrl(baseUrl: string, params: Record<string, string | undefined>): string {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
    return url.toString();
  }

  /**
   * Helper: Parse token expiry
   */
  protected parseExpiresAt(expiresIn?: number): Date | undefined {
    if (!expiresIn) return undefined;
    return new Date(Date.now() + expiresIn * 1000);
  }

  /**
   * Helper: Create token response
   */
  protected createTokenResponse(
    accessToken: string,
    options?: {
      refreshToken?: string;
      expiresIn?: number;
      tokenType?: string;
      scopes?: string[];
      rawResponse?: unknown;
    },
  ): TokenResponse {
    return {
      accessToken,
      refreshToken: options?.refreshToken,
      expiresIn: options?.expiresIn,
      expiresAt: this.parseExpiresAt(options?.expiresIn),
      tokenType: options?.tokenType || 'Bearer',
      scopes: options?.scopes,
      rawResponse: options?.rawResponse,
    };
  }

  /**
   * Helper: Log OAuth errors
   */
  protected logOAuthError(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`OAuth ${operation} failed for ${this.platform}: ${errorMessage}`);
  }
}
