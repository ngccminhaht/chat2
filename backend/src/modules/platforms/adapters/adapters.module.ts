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

@Module({
  providers: [
    FacebookAdapter,
    ZaloAdapter,
    ShopeeAdapter,
    TikTokAdapter,
  ],
  exports: [
    FacebookAdapter,
    ZaloAdapter,
    ShopeeAdapter,
    TikTokAdapter,
  ],
})
export class AdaptersModule implements OnModuleInit {
  constructor(
    private readonly platformRegistry: PlatformRegistry,
    private readonly facebookAdapter: FacebookAdapter,
    private readonly zaloAdapter: ZaloAdapter,
    private readonly shopeeAdapter: ShopeeAdapter,
    private readonly tiktokAdapter: TikTokAdapter,
  ) {}

  onModuleInit() {
    // Register all adapters with the registry
    this.platformRegistry.register(this.facebookAdapter);
    this.platformRegistry.register(this.zaloAdapter);
    this.platformRegistry.register(this.shopeeAdapter);
    this.platformRegistry.register(this.tiktokAdapter);
  }
}
