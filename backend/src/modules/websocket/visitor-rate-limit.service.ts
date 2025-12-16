import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '@/common/env';

@Injectable()
export class VisitorRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(VisitorRateLimitService.name);
  private readonly redis: Redis;

  // Configuration
  private readonly maxConnectionsPerIp = 10;
  private readonly connectionWindowSeconds = 60;
  private readonly maxMessagesPerSession = 30;
  private readonly messageWindowSeconds = 60;

  constructor(private readonly envService: EnvService) {
    const redisUrl = this.envService.get('REDIS_URL');

    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    } else {
      this.redis = new Redis({
        host: this.envService.get('REDIS_HOST'),
        port: this.envService.get('REDIS_PORT'),
        password: this.envService.get('REDIS_PASSWORD'),
        db: this.envService.get('REDIS_DB') || 0,
      });
    }

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err.message);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for rate limiting');
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Check if IP has exceeded connection limit
   * Returns true if allowed, false if rate limited
   */
  async checkConnectionLimit(ip: string): Promise<boolean> {
    const key = `visitor:ratelimit:conn:${ip}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.connectionWindowSeconds);
      }

      if (count > this.maxConnectionsPerIp) {
        this.logger.warn(
          `Connection rate limit exceeded for IP: ${ip} (${count}/${this.maxConnectionsPerIp})`,
        );
        return false;
      }

      return true;
    } catch (error) {
      // If Redis is down, allow the connection (fail open)
      this.logger.error('Rate limit check failed:', error.message);
      return true;
    }
  }

  /**
   * Check message rate limit per session
   * Prevents spam from single visitor
   */
  async checkMessageLimit(sessionId: string): Promise<boolean> {
    const key = `visitor:ratelimit:msg:${sessionId}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.messageWindowSeconds);
      }

      if (count > this.maxMessagesPerSession) {
        this.logger.warn(
          `Message rate limit exceeded for session: ${sessionId} (${count}/${this.maxMessagesPerSession})`,
        );
        return false;
      }

      return true;
    } catch (error) {
      // If Redis is down, allow the message (fail open)
      this.logger.error('Rate limit check failed:', error.message);
      return true;
    }
  }

  /**
   * Reset rate limits for a session (for testing)
   */
  async resetLimits(ip?: string, sessionId?: string): Promise<void> {
    try {
      if (ip) {
        await this.redis.del(`visitor:ratelimit:conn:${ip}`);
      }
      if (sessionId) {
        await this.redis.del(`visitor:ratelimit:msg:${sessionId}`);
      }
    } catch (error) {
      this.logger.error('Failed to reset rate limits:', error.message);
    }
  }
}
