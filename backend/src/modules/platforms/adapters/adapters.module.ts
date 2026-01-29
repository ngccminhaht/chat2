/**
 * Platform Adapters Module
 * Registers all platform adapters with PlatformRegistry
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { PlatformRegistry } from '../core/services/platform.registry';
import { FacebookAdapter } from './facebook.adapter';
import { ZaloAdapter } from './zalo.adapter';
import { ShopeeAdapter } from './shopee.adapter';
import { TikTokAdapter } from './tiktok.adapter';
import { TelegramAdapter } from './telegram.adapter';
import { WebPlatformAdapter } from './web.adapter';

@Module({
  providers: [
    FacebookAdapter,
    ZaloAdapter,
    ShopeeAdapter,
    TikTokAdapter,
    TelegramAdapter,
    WebPlatformAdapter,
  ],
  exports: [
    FacebookAdapter,
    ZaloAdapter,
    ShopeeAdapter,
    TikTokAdapter,
    TelegramAdapter,
    WebPlatformAdapter,
  ],
})
export class AdaptersModule implements OnModuleInit {
  constructor(
    private readonly platformRegistry: PlatformRegistry,
    private readonly facebookAdapter: FacebookAdapter,
    private readonly zaloAdapter: ZaloAdapter,
    private readonly shopeeAdapter: ShopeeAdapter,
    private readonly tiktokAdapter: TikTokAdapter,
    private readonly telegramAdapter: TelegramAdapter,
    private readonly webAdapter: WebPlatformAdapter,
  ) {}

  onModuleInit() {
    // Register all adapters with the registry
    this.platformRegistry.register(this.facebookAdapter);
    this.platformRegistry.register(this.zaloAdapter);
    this.platformRegistry.register(this.shopeeAdapter);
    this.platformRegistry.register(this.tiktokAdapter);
    this.platformRegistry.register(this.telegramAdapter);
    this.platformRegistry.register(this.webAdapter);
  }
}
