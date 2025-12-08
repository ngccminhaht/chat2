import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { Platform } from '@/common/constants';
import {
  IPlatformAdapter,
  FACEBOOK_ADAPTER,
  ZALO_ADAPTER,
  SHOPEE_ADAPTER,
  TIKTOK_ADAPTER,
} from '../interfaces';

/**
 * Platform Registry Service
 * Manages registration and retrieval of platform adapters
 * Implements singleton pattern for adapter management
 */
@Injectable()
export class PlatformRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PlatformRegistryService.name);
  private readonly adapters = new Map<Platform, IPlatformAdapter>();

  constructor(
    @Optional() @Inject(FACEBOOK_ADAPTER) private facebookAdapter?: IPlatformAdapter,
    @Optional() @Inject(ZALO_ADAPTER) private zaloAdapter?: IPlatformAdapter,
    @Optional() @Inject(SHOPEE_ADAPTER) private shopeeAdapter?: IPlatformAdapter,
    @Optional() @Inject(TIKTOK_ADAPTER) private tiktokAdapter?: IPlatformAdapter,
  ) {}

  onModuleInit() {
    // Register adapters that were injected
    if (this.facebookAdapter) {
      this.register(this.facebookAdapter);
    }
    if (this.zaloAdapter) {
      this.register(this.zaloAdapter);
    }
    if (this.shopeeAdapter) {
      this.register(this.shopeeAdapter);
    }
    if (this.tiktokAdapter) {
      this.register(this.tiktokAdapter);
    }

    this.logger.log(
      `Platform registry initialized with ${this.adapters.size} adapter(s): ${this.getSupportedPlatforms().join(', ')}`,
    );
  }

  /**
   * Register a platform adapter
   */
  register(adapter: IPlatformAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      this.logger.warn(`Adapter for ${adapter.platform} already registered, replacing...`);
    }

    // Validate adapter is properly configured
    if (!adapter.isConfigured()) {
      this.logger.warn(
        `Adapter for ${adapter.platform} is not properly configured. Some features may not work.`,
      );
    }

    this.adapters.set(adapter.platform, adapter);
    this.logger.log(`Registered adapter for ${adapter.platform} (${adapter.displayName})`);
  }

  /**
   * Get adapter for a specific platform
   * @throws Error if adapter not found
   */
  getAdapter(platform: Platform): IPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(
        `No adapter registered for platform: ${platform}. Available platforms: ${this.getSupportedPlatforms().join(', ')}`,
      );
    }
    return adapter;
  }

  /**
   * Get adapter for a platform, returns null if not found
   */
  getAdapterOrNull(platform: Platform): IPlatformAdapter | null {
    return this.adapters.get(platform) || null;
  }

  /**
   * Check if a platform is supported
   */
  isSupported(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  /**
   * Get list of supported platforms
   */
  getSupportedPlatforms(): Platform[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get platform adapter count
   */
  getAdapterCount(): number {
    return this.adapters.size;
  }

  /**
   * Unregister a platform adapter
   */
  unregister(platform: Platform): boolean {
    const removed = this.adapters.delete(platform);
    if (removed) {
      this.logger.log(`Unregistered adapter for ${platform}`);
    }
    return removed;
  }

  /**
   * Clear all adapters (useful for testing)
   */
  clear(): void {
    this.adapters.clear();
    this.logger.log('Cleared all platform adapters');
  }
}
