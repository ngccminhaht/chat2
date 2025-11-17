import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface OAuthStateData {
  codeVerifier: string;
  state: string;
  userId?: string;
  createdAt: number;
}

@Injectable()
export class OAuthStateService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly PREFIX = 'oauth:state:';
  private readonly TTL = 600; // 10 minutes in seconds

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis connected for OAuth state management');
    });
  }

  /**
   * Store OAuth state data in Redis with TTL
   */
  async storeState(state: string, data: OAuthStateData): Promise<void> {
    const key = this.PREFIX + state;
    await this.redis.setex(key, this.TTL, JSON.stringify(data));
  }

  /**
   * Retrieve and delete OAuth state data from Redis
   */
  async getAndDeleteState(state: string): Promise<OAuthStateData | null> {
    const key = this.PREFIX + state;

    // Use pipeline for atomic get + delete
    const pipeline = this.redis.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();

    if (!results || !results[0] || !results[0][1]) {
      return null;
    }

    const data = results[0][1] as string;
    return JSON.parse(data);
  }

  /**
   * Clean up Redis connection on module destroy
   */
  async onModuleDestroy() {
    await this.redis.quit();
  }
}
