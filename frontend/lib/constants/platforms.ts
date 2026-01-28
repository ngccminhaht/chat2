/**
 * Platform Constants (Frontend)
 * Must match backend constants
 */

export enum Platform {
  FACEBOOK = 'facebook',
  ZALO = 'zalo',
  TIKTOK = 'tiktok',
  SHOPEE = 'shopee',
  TELEGRAM = 'telegram',
}

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  [Platform.FACEBOOK]: 'Facebook',
  [Platform.ZALO]: 'Zalo OA',
  [Platform.TIKTOK]: 'TikTok Shop',
  [Platform.SHOPEE]: 'Shopee',
  [Platform.TELEGRAM]: 'Telegram',
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  [Platform.FACEBOOK]: '#1877F2',
  [Platform.ZALO]: '#0068FF',
  [Platform.TIKTOK]: '#000000',
  [Platform.SHOPEE]: '#EE4D2D',
  [Platform.TELEGRAM]: '#0088CC',
};

export const PLATFORM_ICONS: Record<Platform, string> = {
  [Platform.FACEBOOK]: '/icons/facebook.svg',
  [Platform.ZALO]: '/icons/zalo.svg',
  [Platform.TIKTOK]: '/icons/tiktok.svg',
  [Platform.SHOPEE]: '/icons/shopee.svg',
  [Platform.TELEGRAM]: '/icons/telegram.svg',
};

// Platform metadata for UI components
export interface PlatformConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  requiresOAuth: boolean;
}

export const AVAILABLE_PLATFORMS: PlatformConfig[] = [
  {
    id: Platform.FACEBOOK,
    name: 'Facebook Messenger',
    description: 'Connect your Facebook Page to receive messages',
    color: PLATFORM_COLORS[Platform.FACEBOOK],
    requiresOAuth: true,
  },
  {
    id: Platform.ZALO,
    name: 'Zalo OA',
    description: 'Connect your Zalo Official Account',
    color: PLATFORM_COLORS[Platform.ZALO],
    requiresOAuth: true,
  },
  {
    id: Platform.SHOPEE,
    name: 'Shopee',
    description: 'Connect your Shopee seller account',
    color: PLATFORM_COLORS[Platform.SHOPEE],
    requiresOAuth: true,
  },
  {
    id: Platform.TIKTOK,
    name: 'TikTok Shop',
    description: 'Connect your TikTok Shop account',
    color: PLATFORM_COLORS[Platform.TIKTOK],
    requiresOAuth: true,
  },
  {
    id: Platform.TELEGRAM,
    name: 'Telegram Bot',
    description: 'Connect your Telegram bot with bot token',
    color: PLATFORM_COLORS[Platform.TELEGRAM],
    requiresOAuth: false,
  },
];
