/**
 * Platform Registry
 * Factory service to get platform adapters by platform type
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Platform } from "@/common/constants";
import { IPlatformAdapter } from "../interfaces";

@Injectable()
export class PlatformRegistry implements OnModuleInit {
  private readonly logger = new Logger(PlatformRegistry.name);
  private adapters: Map<Platform, IPlatformAdapter> = new Map();

  async onModuleInit() {
    // Adapters will be registered by AdaptersModule after all are initialized
    this.logger.log("PlatformRegistry initialized");
  }

  /**
   * Register a platform adapter
   * Called by adapters during module initialization
   */
  register(adapter: IPlatformAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      this.logger.warn(
        `Adapter for ${adapter.platform} already registered, replacing...`
      );
    }
    this.adapters.set(adapter.platform, adapter);
    this.logger.log(`Registered adapter for platform: ${adapter.platform}`);
  }

  /**
   * Get adapter for a specific platform
   * @throws Error if adapter not found
   */
  get(platform: Platform): IPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  /**
   * Get adapter for a platform, or undefined if not found
   */
  getOptional(platform: Platform): IPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Check if an adapter is registered for a platform
   */
  has(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  /**
   * Get all registered adapters
   */
  getAll(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all registered platform types
   */
  getRegisteredPlatforms(): Platform[] {
    return Array.from(this.adapters.keys());
  }
}
