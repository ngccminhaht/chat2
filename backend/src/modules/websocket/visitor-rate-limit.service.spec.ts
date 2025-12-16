import { Test, TestingModule } from '@nestjs/testing';
import { VisitorRateLimitService } from './visitor-rate-limit.service';
import { EnvService } from '@/common/env';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    disconnect: jest.fn(),
  }));
});

describe('VisitorRateLimitService', () => {
  let service: VisitorRateLimitService;
  let mockRedis: any;

  beforeEach(async () => {
    const mockEnvService = {
      get: jest.fn((key: string) => {
        const values: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: undefined,
          REDIS_DB: 0,
          REDIS_URL: undefined,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorRateLimitService,
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    service = module.get<VisitorRateLimitService>(VisitorRateLimitService);
    mockRedis = (service as any).redis;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConnectionLimit', () => {
    it('should return true if under limit', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkConnectionLimit('192.168.1.1');

      expect(result).toBe(true);
      expect(mockRedis.incr).toHaveBeenCalledWith('visitor:ratelimit:conn:192.168.1.1');
      expect(mockRedis.expire).toHaveBeenCalledWith('visitor:ratelimit:conn:192.168.1.1', 60);
    });

    it('should return false if over limit', async () => {
      mockRedis.incr.mockResolvedValue(11); // Over the limit of 10

      const result = await service.checkConnectionLimit('192.168.1.1');

      expect(result).toBe(false);
    });

    it('should return true on redis error (fail open)', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis down'));

      const result = await service.checkConnectionLimit('192.168.1.1');

      expect(result).toBe(true);
    });

    it('should not set expire on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(5); // Not first request

      await service.checkConnectionLimit('192.168.1.1');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('checkMessageLimit', () => {
    it('should return true if under message limit', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkMessageLimit('session123');

      expect(result).toBe(true);
      expect(mockRedis.incr).toHaveBeenCalledWith('visitor:ratelimit:msg:session123');
    });

    it('should return false if over message limit', async () => {
      mockRedis.incr.mockResolvedValue(31); // Over the limit of 30

      const result = await service.checkMessageLimit('session123');

      expect(result).toBe(false);
    });

    it('should return true on redis error (fail open)', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis down'));

      const result = await service.checkMessageLimit('session123');

      expect(result).toBe(true);
    });
  });

  describe('resetLimits', () => {
    it('should delete rate limit keys', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.resetLimits('192.168.1.1', 'session123');

      expect(mockRedis.del).toHaveBeenCalledWith('visitor:ratelimit:conn:192.168.1.1');
      expect(mockRedis.del).toHaveBeenCalledWith('visitor:ratelimit:msg:session123');
    });

    it('should only delete IP key if sessionId not provided', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.resetLimits('192.168.1.1');

      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith('visitor:ratelimit:conn:192.168.1.1');
    });

    it('should handle redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(service.resetLimits('192.168.1.1')).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect redis', () => {
      service.onModuleDestroy();

      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });
});
