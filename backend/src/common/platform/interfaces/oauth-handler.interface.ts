import { Platform } from '@/common/constants';

/**
 * Parameters for generating authorization URL
 */
export interface AuthUrlParams {
  state: string;
  redirectUri: string;
  scopes?: string[];
  codeVerifier?: string; // For PKCE (Zalo)
  codeChallenge?: string; // For PKCE (Zalo)
  extras?: Record<string, string>;
}

/**
 * Token response from OAuth exchange
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
  expiresAt?: Date;
  tokenType?: string;
  scopes?: string[];
  rawResponse?: unknown;
}

/**
 * Platform account information
 */
export interface PlatformAccountInfo {
  platformAccountId: string;
  platformAccountName: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

/**
 * OAuth exchange parameters
 */
export interface TokenExchangeParams {
  code: string;
  redirectUri?: string;
  codeVerifier?: string; // For PKCE
}

/**
 * OAuth handler interface - each platform must implement this
 */
export interface IOAuthHandler {
  /**
   * Platform this handler manages
   */
  readonly platform: Platform;

  /**
   * Generate authorization URL for OAuth flow
   */
  generateAuthUrl(params: AuthUrlParams): string;

  /**
   * Exchange authorization code for access token
   */
  exchangeCodeForToken(params: TokenExchangeParams): Promise<TokenResponse>;

  /**
   * Refresh access token using refresh token
   * Returns null if refresh is not supported or refresh token is invalid
   */
  refreshToken(refreshToken: string): Promise<TokenResponse | null>;

  /**
   * Get platform account information using access token
   * For Facebook: returns list of pages
   * For Zalo: returns OA info
   * For Shopee: returns shop info
   */
  getAccountInfo(accessToken: string): Promise<PlatformAccountInfo[]>;

  /**
   * Revoke access token (optional - not all platforms support)
   */
  revokeToken?(accessToken: string): Promise<void>;

  /**
   * Check if this platform uses PKCE
   */
  usesPKCE(): boolean;

  /**
   * Generate code verifier for PKCE (if supported)
   */
  generateCodeVerifier?(): string;

  /**
   * Generate code challenge from verifier (if PKCE is used)
   */
  generateCodeChallenge?(codeVerifier: string): string;
}
