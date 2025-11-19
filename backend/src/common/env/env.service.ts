/**
 * Environment Service
 * Centralized, type-safe access to environment variables
 * Uses class-validator schema validation
 */

import { Injectable, Logger } from '@nestjs/common';
import { validateEnv, EnvironmentVariables } from './env.schema';

@Injectable()
export class EnvService {
  private readonly logger = new Logger(EnvService.name);
  private config!: EnvironmentVariables;

  async onModuleInit() {
    this.config = await validateEnv();
    this.logger.log('EnvService initialized with validated config');
  }

  // ============================================================================
  // Database
  // ============================================================================

  get mongoUri(): string {
    return this.config.MONGODB_URI;
  }

  // ============================================================================
  // JWT Configuration
  // ============================================================================

  get jwtSecret(): string {
    return this.config.JWT_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.config.JWT_REFRESH_SECRET;
  }

  get jwtExpiresIn(): string {
    return this.config.JWT_EXPIRES_IN;
  }

  get jwtRefreshExpiresIn(): string {
    return this.config.JWT_REFRESH_EXPIRES_IN;
  }

  // ============================================================================
  // Encryption
  // ============================================================================

  get encryptionKey(): string {
    return this.config.ENCRYPTION_KEY;
  }

  // ============================================================================
  // Kafka Configuration
  // ============================================================================

  get kafkaBrokers(): string[] {
    return this.config.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
  }

  get kafkaClientId(): string {
    return this.config.KAFKA_CLIENT_ID;
  }

  get kafkaGroupId(): string {
    return this.config.KAFKA_GROUP_ID;
  }

  // ============================================================================
  // Redis Configuration
  // ============================================================================

  get redisHost(): string {
    return this.config.REDIS_HOST;
  }

  get redisPort(): number {
    return this.config.REDIS_PORT;
  }

  get redisPassword(): string | undefined {
    return this.config.REDIS_PASSWORD;
  }

  // ============================================================================
  // Server Configuration
  // ============================================================================

  get port(): number {
    return this.config.PORT;
  }

  get nodeEnv(): 'development' | 'production' | 'test' {
    return this.config.NODE_ENV;
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get corsOrigins(): string[] {
    return this.config.CORS_ORIGINS.split(',').map((origin) => origin.trim());
  }

  // ============================================================================
  // Facebook Platform
  // ============================================================================

  get facebookAppId(): string | undefined {
    return this.config.FACEBOOK_APP_ID;
  }

  get facebookAppSecret(): string | undefined {
    return this.config.FACEBOOK_APP_SECRET;
  }

  get facebookRedirectUri(): string | undefined {
    return this.config.FACEBOOK_REDIRECT_URI;
  }

  get facebookWebhookSecret(): string | undefined {
    return this.config.FACEBOOK_WEBHOOK_SECRET;
  }

  // ============================================================================
  // Zalo Platform
  // ============================================================================

  get zaloAppId(): string | undefined {
    return this.config.ZALO_APP_ID;
  }

  get zaloAppSecret(): string | undefined {
    return this.config.ZALO_APP_SECRET;
  }

  get zaloRedirectUri(): string | undefined {
    return this.config.ZALO_REDIRECT_URI;
  }

  get zaloVerificationToken(): string {
    return this.config.ZALO_VERIFICATION_TOKEN;
  }

  // ============================================================================
  // Shopee Platform
  // ============================================================================

  get shopeePartnerId(): string | undefined {
    return this.config.SHOPEE_PARTNER_ID;
  }

  get shopeePartnerKey(): string | undefined {
    return this.config.SHOPEE_PARTNER_KEY;
  }

  get shopeeRedirectUri(): string | undefined {
    return this.config.SHOPEE_REDIRECT_URI;
  }

  // ============================================================================
  // TikTok Platform
  // ============================================================================

  get tiktokAppId(): string | undefined {
    return this.config.TIKTOK_APP_ID;
  }

  get tiktokAppSecret(): string | undefined {
    return this.config.TIKTOK_APP_SECRET;
  }

  get tiktokRedirectUri(): string | undefined {
    return this.config.TIKTOK_REDIRECT_URI;
  }

  // ============================================================================
  // Feature Flags
  // ============================================================================

  get enableWebhookLogging(): boolean {
    return this.config.ENABLE_WEBHOOK_LOGGING ?? this.isDevelopment;
  }

  get enableDebugLogging(): boolean {
    return this.config.ENABLE_DEBUG_LOGGING ?? this.isDevelopment;
  }

  // ============================================================================
  // Platform-Specific Methods
  // ============================================================================

  /**
   * Get OAuth configuration for a specific platform
   */
  getPlatformOAuthConfig(platform: 'facebook' | 'zalo' | 'shopee' | 'tiktok'): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const configs = {
      facebook: {
        clientId: this.config.FACEBOOK_APP_ID,
        clientSecret: this.config.FACEBOOK_APP_SECRET,
        redirectUri: this.config.FACEBOOK_REDIRECT_URI,
      },
      zalo: {
        clientId: this.config.ZALO_APP_ID,
        clientSecret: this.config.ZALO_APP_SECRET,
        redirectUri: this.config.ZALO_REDIRECT_URI,
      },
      shopee: {
        clientId: this.config.SHOPEE_PARTNER_ID,
        clientSecret: this.config.SHOPEE_PARTNER_KEY,
        redirectUri: this.config.SHOPEE_REDIRECT_URI,
      },
      tiktok: {
        clientId: this.config.TIKTOK_APP_ID,
        clientSecret: this.config.TIKTOK_APP_SECRET,
        redirectUri: this.config.TIKTOK_REDIRECT_URI,
      },
    };

    const config = configs[platform];

    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error(
        `Missing OAuth configuration for ${platform}. ` +
          `Check your .env file for ${platform.toUpperCase()}_* variables.`,
      );
    }

    return {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    };
  }

  /**
   * Check if a platform is configured
   */
  isPlatformConfigured(platform: 'facebook' | 'zalo' | 'shopee' | 'tiktok'): boolean {
    try {
      this.getPlatformOAuthConfig(platform);
      return true;
    } catch {
      return false;
    }
  }
}
