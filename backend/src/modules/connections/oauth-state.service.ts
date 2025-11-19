import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface OAuthStateData {
  codeVerifier?: string; // Optional - used by Zalo (PKCE)
  state: string;
  userId?: string;
  createdAt: number;
  // Shopee-specific temporary data
  tokenResponse?: any;
  shopInfo?: any;
  [key: string]: any; // Allow other platform-specific fields
}

@Injectable()
export class OAuthStateService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly PREFIX = 'oauth:state:';
  private readonly TTL = 600; // 10 minutes in seconds

  constructor() {
    // Support both REDIS_URL and individual config params
    const redisUrl = process.env.REDIS_URL;

    let redisConfig;
    if (redisUrl) {
      // Use connection string if available
      console.log('🔧 Using REDIS_URL for OAuth state connection');
      this.redis = new Redis(redisUrl);
    } else {
      // Fall back to individual parameters
      redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
      };

      console.log('🔧 Redis config for OAuth state:', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
        hasPassword: !!redisConfig.password,
      });

      this.redis = new Redis(redisConfig);
    }

    this.redis.on('error', (err) => {
      console.error('❌ Redis connection error for OAuth state:', err.message);
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis connected for OAuth state management');
    });

    this.redis.on('ready', () => {
      console.log('✅ Redis ready for OAuth state operations');
    });
  }

  /**
   * Store OAuth state data in Redis with TTL
   */
  async storeState(state: string, data: OAuthStateData): Promise<void> {
    const key = this.PREFIX + state;
    console.log('📝 Storing OAuth state:', { key, state, userId: data.userId });

    try {
      await this.redis.setex(key, this.TTL, JSON.stringify(data));
      console.log('✅ OAuth state stored successfully');

      // Verify storage
      const verify = await this.redis.get(key);
      console.log('🔍 Verification - state exists in Redis:', !!verify);
    } catch (error) {
      console.error('❌ Failed to store OAuth state:', error);
      throw error;
    }
  }

  /**
   * Retrieve OAuth state data from Redis without deleting
   */
  async getState(state: string): Promise<OAuthStateData | null> {
    const key = this.PREFIX + state;
    console.log('🔍 Retrieving OAuth state (no delete):', { key, state });

    const data = await this.redis.get(key);

    if (!data) {
      console.error('❌ OAuth state not found in Redis');
      return null;
    }

    console.log('✅ OAuth state retrieved successfully');
    return JSON.parse(data);
  }

  /**
   * Retrieve and delete OAuth state data from Redis
   */
  async getAndDeleteState(state: string): Promise<OAuthStateData | null> {
    const key = this.PREFIX + state;
    console.log('🔍 Retrieving OAuth state:', { key, state });

    // Use pipeline for atomic get + delete
    const pipeline = this.redis.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();
    console.log('📊 Redis pipeline results:', results);

    if (!results || !results[0] || !results[0][1]) {
      console.error('❌ OAuth state not found in Redis');
      return null;
    }

    const data = results[0][1] as string;
    console.log('✅ OAuth state retrieved successfully');
    return JSON.parse(data);
  }

  /**
   * Clean up Redis connection on module destroy
   */
  async onModuleDestroy() {
    await this.redis.quit();
  }
}
