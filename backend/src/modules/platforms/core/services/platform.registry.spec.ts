import { Test, TestingModule } from '@nestjs/testing';
import { PlatformRegistry } from './platform.registry';
import { IPlatformAdapter } from './../interfaces';
import { Platform } from '@/common/constants';

describe('PlatformRegistry', () => {
  let registry: PlatformRegistry;

  // Mock adapter
  const createMockAdapter = (platform: Platform): IPlatformAdapter => ({
    platform,
    verifySignature: jest.fn(),
    extractAccountId: jest.fn(),
    extractEvents: jest.fn(),
    normalizeMessage: jest.fn(),
    getConversationKey: jest.fn(),
    formatOutbound: jest.fn(),
    send: jest.fn(),
    fetchUserProfile: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformRegistry],
    }).compile();

    registry = module.get<PlatformRegistry>(PlatformRegistry);
  });

  describe('register', () => {
    it('should register an adapter successfully', () => {
      const adapter = createMockAdapter(Platform.FACEBOOK);
      registry.register(adapter);

      expect(registry.has(Platform.FACEBOOK)).toBe(true);
    });

    it('should replace existing adapter when registering same platform', () => {
      const adapter1 = createMockAdapter(Platform.FACEBOOK);
      const adapter2 = createMockAdapter(Platform.FACEBOOK);

      registry.register(adapter1);
      registry.register(adapter2);

      expect(registry.get(Platform.FACEBOOK)).toBe(adapter2);
    });
  });

  describe('get', () => {
    it('should return registered adapter', () => {
      const adapter = createMockAdapter(Platform.ZALO);
      registry.register(adapter);

      expect(registry.get(Platform.ZALO)).toBe(adapter);
    });

    it('should throw error for unregistered platform', () => {
      expect(() => registry.get(Platform.TIKTOK)).toThrow(
        'No adapter registered for platform: tiktok',
      );
    });
  });

  describe('getOptional', () => {
    it('should return adapter if registered', () => {
      const adapter = createMockAdapter(Platform.SHOPEE);
      registry.register(adapter);

      expect(registry.getOptional(Platform.SHOPEE)).toBe(adapter);
    });

    it('should return undefined for unregistered platform', () => {
      expect(registry.getOptional(Platform.TIKTOK)).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered platform', () => {
      const adapter = createMockAdapter(Platform.FACEBOOK);
      registry.register(adapter);

      expect(registry.has(Platform.FACEBOOK)).toBe(true);
    });

    it('should return false for unregistered platform', () => {
      expect(registry.has(Platform.FACEBOOK)).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered adapters', () => {
      const fbAdapter = createMockAdapter(Platform.FACEBOOK);
      const zaloAdapter = createMockAdapter(Platform.ZALO);

      registry.register(fbAdapter);
      registry.register(zaloAdapter);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(fbAdapter);
      expect(all).toContain(zaloAdapter);
    });
  });

  describe('getRegisteredPlatforms', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.getRegisteredPlatforms()).toEqual([]);
    });

    it('should return all registered platform types', () => {
      registry.register(createMockAdapter(Platform.FACEBOOK));
      registry.register(createMockAdapter(Platform.ZALO));
      registry.register(createMockAdapter(Platform.SHOPEE));

      const platforms = registry.getRegisteredPlatforms();
      expect(platforms).toHaveLength(3);
      expect(platforms).toContain(Platform.FACEBOOK);
      expect(platforms).toContain(Platform.ZALO);
      expect(platforms).toContain(Platform.SHOPEE);
    });
  });
});
