/**
 * External API Endpoints
 * Centralized URLs for platform APIs
 */

import { Platform, PLATFORM_API_VERSIONS } from './platforms.constant';

export const FACEBOOK_API_BASE = `https://graph.facebook.com/${PLATFORM_API_VERSIONS[Platform.FACEBOOK]}`;

export const FACEBOOK_ENDPOINTS = {
  OAUTH: 'https://www.facebook.com/v19.0/dialog/oauth',
  TOKEN: `${FACEBOOK_API_BASE}/oauth/access_token`,
  ME: `${FACEBOOK_API_BASE}/me`,
  PAGES: `${FACEBOOK_API_BASE}/me/accounts`,
  PAGE_SUBSCRIPTIONS: (pageId: string) =>
    `${FACEBOOK_API_BASE}/${pageId}/subscribed_apps`,
  SEND_MESSAGE: (pageId: string) => `${FACEBOOK_API_BASE}/${pageId}/messages`,
} as const;

export const ZALO_API_BASE = 'https://openapi.zalo.me';

export const ZALO_ENDPOINTS = {
  OAUTH: 'https://oauth.zaloapp.com/v4/permission',
  TOKEN: 'https://oauth.zaloapp.com/v4/access_token',
  OA_INFO_V2: `${ZALO_API_BASE}/v2.0/oa/getoa`,
  OA_INFO_V3: `${ZALO_API_BASE}/v3.0/oa/info`,
  SEND_MESSAGE: `${ZALO_API_BASE}/v3.0/oa/message/cs`,
  UPLOAD_IMAGE: `${ZALO_API_BASE}/v2.0/oa/upload/image`,
  UPLOAD_FILE: `${ZALO_API_BASE}/v2.0/oa/upload/file`,
  REFRESH_TOKEN: 'https://oauth.zaloapp.com/v4/oa/access_token',
} as const;

export const SHOPEE_API_BASE = 'https://partner.shopeemobile.com';

export const SHOPEE_ENDPOINTS = {
  AUTH: `${SHOPEE_API_BASE}/api/v2/shop/auth_partner`,
  TOKEN: `${SHOPEE_API_BASE}/api/v2/auth/token/get`,
  REFRESH_TOKEN: `${SHOPEE_API_BASE}/api/v2/auth/access_token/get`,
  SHOP_INFO: `${SHOPEE_API_BASE}/api/v2/shop/get_shop_info`,
  CONVERSATIONS: `${SHOPEE_API_BASE}/api/v2/sellerchat/get_conversation_list`,
  MESSAGES: `${SHOPEE_API_BASE}/api/v2/sellerchat/get_message`,
  SEND_MESSAGE: `${SHOPEE_API_BASE}/api/v2/sellerchat/send_message`,
} as const;

