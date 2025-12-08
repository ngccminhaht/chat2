/**
 * Platform-specific credential extensions
 */
export interface FacebookCredentials {
  pageAccessTokens?: Record<string, string>; // pageId -> pageAccessToken
  userAccessToken?: string;
}

export interface ZaloCredentials {
  codeVerifier?: string;
}

export interface ShopeeCredentials {
  partnerId?: string;
  shopId?: string;
}

export interface TikTokCredentials {
  openId?: string;
}

/**
 * Unified platform credentials type
 * Base credentials + platform-specific extensions
 */
export interface PlatformCredentials {
  // Common credentials
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];

  // Platform-specific (type-safe)
  facebook?: FacebookCredentials;
  zalo?: ZaloCredentials;
  shopee?: ShopeeCredentials;
  tiktok?: TikTokCredentials;
}

/**
 * Helper to check if credentials are expired
 */
export function isCredentialsExpired(credentials: PlatformCredentials): boolean {
  if (!credentials.expiresAt) {
    return false; // No expiry set, assume valid
  }
  // Add 5 minute buffer
  const buffer = 5 * 60 * 1000;
  return new Date().getTime() > credentials.expiresAt.getTime() - buffer;
}

/**
 * Helper to check if credentials need refresh
 * Returns true if expiring within 1 hour
 */
export function needsRefresh(credentials: PlatformCredentials): boolean {
  if (!credentials.expiresAt || !credentials.refreshToken) {
    return false;
  }
  const oneHour = 60 * 60 * 1000;
  return new Date().getTime() > credentials.expiresAt.getTime() - oneHour;
}
