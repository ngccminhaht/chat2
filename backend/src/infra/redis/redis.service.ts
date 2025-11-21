import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '@/common/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly envService: EnvService) {
    const redisUrl = this.envService.get('REDIS_URL');

    if (redisUrl) {
      this.logger.log('🔧 Using REDIS_URL for connection');
      this.client = new Redis(redisUrl);
    } else {
      const redisConfig: any = {
        host: this.envService.get('REDIS_HOST'),
        port: this.envService.get('REDIS_PORT'),
      };

      const password = this.envService.get('REDIS_PASSWORD');
      const db = this.envService.get('REDIS_DB');

      if (password) {
        redisConfig.password = password;
      }

      if (db !== undefined) {
        redisConfig.db = db;
      }

      this.logger.log('🔧 Redis config:', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
        hasPassword: !!redisConfig.password,
      });

      this.client = new Redis(redisConfig);
    }

    this.client.on('error', (err) => {
      this.logger.error('❌ Redis connection error:', err.message);
    });

    this.client.on('connect', () => {
      this.logger.log('✅ Redis connected');
    });

    this.client.on('ready', () => {
      this.logger.log('✅ Redis ready');
    });
  }

  /**
   * Get the Redis client instance
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Set a key with optional TTL (in seconds)
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  /**
   * Get and delete a key atomically using pipeline
   */
  async getAndDelete(key: string): Promise<string | null> {
    const pipeline = this.client.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();

    if (!results || !results[0] || !results[0][1]) {
      return null;
    }

    return results[0][1] as string;
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set TTL on an existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  /**
   * Clean up Redis connection on module destroy
   */
  async onModuleDestroy() {
    this.logger.log('🔌 Closing Redis connection');
    await this.client.quit();
  }
}
