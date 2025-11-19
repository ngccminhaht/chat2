/**
 * Platform Constants (Frontend)
 * Must match backend constants
 */

export enum Platform {
  FACEBOOK = 'facebook',
  ZALO = 'zalo',
  TIKTOK = 'tiktok',
  SHOPEE = 'shopee',
}

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'Facebook',
  [Platform.ZALO]: 'Zalo OA',
  [Platform.TIKTOK]: 'TikTok Shop',
  [Platform.SHOPEE]: 'Shopee',
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  [Platform.FACEBOOK]: '#1877F2',
  [Platform.ZALO]: '#0068FF',
  [Platform.TIKTOK]: '#000000',
  [Platform.SHOPEE]: '#EE4D2D',
};

export const PLATFORM_ICONS: Record<Platform, string> = {
  [Platform.FACEBOOK]: '/icons/facebook.svg',
  [Platform.ZALO]: '/icons/zalo.svg',
  [Platform.TIKTOK]: '/icons/tiktok.svg',
  [Platform.SHOPEE]: '/icons/shopee.svg',
};
