import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/infra/redis';

export interface OAuthStateData {
  codeVerifier?: string; // Optional - used by Zalo (PKCE)
  state: string;
  userId?: string;
  organizationId?: string; // Required for multi-tenant connections
  createdAt: number;
  // Shopee-specific temporary data
  tokenResponse?: any;
  shopInfo?: any;
  [key: string]: any; // Allow other platform-specific fields
}

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly PREFIX = 'oauth:state:';
  private readonly TTL = 600; // 10 minutes in seconds

  constructor(private readonly redisService: RedisService) {}

  /**
   * Store OAuth state data in Redis with TTL
   */
  async storeState(state: string, data: OAuthStateData): Promise<void> {
    const key = this.PREFIX + state;
    this.logger.log(`📝 Storing OAuth state: ${state} for user ${data.userId}`);

    try {
      await this.redisService.set(key, JSON.stringify(data), this.TTL);
      this.logger.log('✅ OAuth state stored successfully');

      // Verify storage
      const verify = await this.redisService.get(key);
      this.logger.log(`🔍 Verification - state exists in Redis: ${!!verify}`);
    } catch (error) {
      this.logger.error('❌ Failed to store OAuth state:', error);
      throw error;
    }
  }

  /**
   * Retrieve OAuth state data from Redis without deleting
   */
  async getState(state: string): Promise<OAuthStateData | null> {
    const key = this.PREFIX + state;
    this.logger.log(`🔍 Retrieving OAuth state (no delete): ${state}`);

    const data = await this.redisService.get(key);

    if (!data) {
      this.logger.error('❌ OAuth state not found in Redis');
      return null;
    }

    this.logger.log('✅ OAuth state retrieved successfully');
    return JSON.parse(data);
  }

  /**
   * Retrieve and delete OAuth state data from Redis
   */
  async getAndDeleteState(state: string): Promise<OAuthStateData | null> {
    const key = this.PREFIX + state;
    this.logger.log(`🔍 Retrieving and deleting OAuth state: ${state}`);

    const data = await this.redisService.getAndDelete(key);

    if (!data) {
      this.logger.error('❌ OAuth state not found in Redis');
      return null;
    }

    this.logger.log('✅ OAuth state retrieved and deleted successfully');
    return JSON.parse(data);
  }
}
