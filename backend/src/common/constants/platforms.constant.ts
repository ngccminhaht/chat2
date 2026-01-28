/**
 * Platform Constants
 * Centralized platform identifiers and configurations
 */

export enum Platform {
  FACEBOOK = 'facebook',
  ZALO = 'zalo',
  TIKTOK = 'tiktok',
  SHOPEE = 'shopee',
  TELEGRAM = 'telegram',
  WEB = 'web',
}

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'Facebook Messenger',
  [Platform.ZALO]: 'Zalo OA',
  [Platform.TIKTOK]: 'TikTok Shop',
  [Platform.SHOPEE]: 'Shopee',
  [Platform.TELEGRAM]: 'Telegram Bot',
  [Platform.WEB]: 'Web Chat',
};

export const PLATFORM_API_VERSIONS: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'v19.0',
  [Platform.ZALO]: 'v2.0',
  [Platform.TIKTOK]: 'v1.0',
  [Platform.SHOPEE]: 'v2.0',
  [Platform.TELEGRAM]: 'bot-api',
  [Platform.WEB]: 'v1.0',
};

export const PLATFORM_OAUTH_SCOPES: Record<Platform, string> = {
  [Platform.FACEBOOK]:
    'public_profile,email,pages_manage_metadata,pages_read_engagement,pages_show_list,pages_read_user_content,pages_manage_posts,pages_manage_engagement,pages_messaging,ads_read,ads_management,page_events,pages_manage_ads,catalog_management,leads_retrieval,business_management,pages_utility_messaging',
  [Platform.ZALO]:
    'https://graph.zalo.me/v2.0/me/info,https://openapi.zalo.me/v2.0/oa/info,https://openapi.zalo.me/v2.0/oa/message',
  [Platform.TIKTOK]: 'user.info.basic,video.list',
  [Platform.SHOPEE]: 'order.read,shop.read,product.read',
  [Platform.TELEGRAM]: '', // Telegram uses bot token, not OAuth
  [Platform.WEB]: '',
};
