export interface PlatformConnection {
  id: string;
  userId: string;
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
  platformAccountId: string;
  platformAccountName: string;
  status: 'active' | 'expired' | 'error';
  credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    scopes?: string[];
  };
  webhookSecret?: string;
  metadata: {
    pageId?: string;
    oaId?: string;
    shopId?: string;
    description?: string;
    avatar?: string;
    [key: string]: any;
  };
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZaloAuthUrlResponse {
  authUrl: string;
  codeVerifier: string;
  state: string;
}

export interface ConnectPlatformRequest {
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
}
