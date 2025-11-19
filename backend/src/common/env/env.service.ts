import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvSchema } from './env.schema';

@Injectable()
export class EnvService {
  constructor(private readonly configService: ConfigService<EnvSchema, true>) {}

  get<K extends keyof EnvSchema>(key: K): EnvSchema[K] {
    return this.configService.get(key, { infer: true });
  }

  // Convenience getters for commonly used values
  get nodeEnv(): string {
    return this.get('NODE_ENV');
  }

  get port(): number {
    return this.get('PORT');
  }

  get frontendUrl(): string {
    return this.get('FRONTEND_URL');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS');
  }

  get mongoUri(): string {
    return this.get('MONGODB_URI');
  }

  get redisHost(): string {
    return this.get('REDIS_HOST');
  }

  get redisPort(): number {
    return this.get('REDIS_PORT');
  }

  get jwtSecret(): string {
    return this.get('JWT_SECRET');
  }

  get jwtRefreshSecret(): string {
    return this.get('JWT_REFRESH_SECRET');
  }

  get kafkaBroker(): string {
    return this.get('KAFKA_BROKER');
  }

  get zaloAppId(): string | undefined {
    return this.get('ZALO_APP_ID');
  }

  get zaloAppSecret(): string | undefined {
    return this.get('ZALO_APP_SECRET');
  }

  get facebookAppId(): string | undefined {
    return this.get('FACEBOOK_APP_ID');
  }

  get facebookAppSecret(): string | undefined {
    return this.get('FACEBOOK_APP_SECRET');
  }

  get facebookVerifyToken(): string | undefined {
    return this.get('FACEBOOK_VERIFY_TOKEN');
  }

  get shopeePartnerId(): string | undefined {
    return this.get('SHOPEE_PARTNER_ID');
  }

  get shopeePartnerKey(): string | undefined {
    return this.get('SHOPEE_PARTNER_KEY');
  }

  // Helper methods
  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }
}
