import { Test, TestingModule } from '@nestjs/testing';
import { TikTokAdapter, TikTokMessageType } from './tiktok.adapter';
import { EnvService } from '@/common/env';
import { Platform, MessageType, MessageDirection } from '@/common/constants';

describe('TikTokAdapter', () => {
  let adapter: TikTokAdapter;

  const mockEnvService = {
    get: jest.fn((key: string) => {
      const env: Record<string, string> = {
        TIKTOK_APP_ID: 'test_app_id',
        TIKTOK_APP_SECRET: 'test_app_secret',
      };
      return env[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokAdapter,
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    adapter = module.get<TikTokAdapter>(TikTokAdapter);
  });

  describe('platform', () => {
    it('should return TIKTOK platform', () => {
      expect(adapter.platform).toBe(Platform.TIKTOK);
    });
  });

  describe('verifySignature', () => {
    it('should return false if signature is empty', () => {
      expect(adapter.verifySignature('body', '', 'secret')).toBe(false);
    });

    it('should verify valid signature correctly', () => {
      const crypto = require('crypto');
      const body = '{"test":"data"}';
      const secret = 'test_secret';
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(body);
      const signature = hmac.digest('hex');

      expect(adapter.verifySignature(body, signature, secret)).toBe(true);
    });
  });

  describe('extractAccountId', () => {
    it('should extract shop_id from payload', () => {
      const payload = {
        type: 1,
        shop_id: 'shop_123',
        data: {},
      };
      expect(adapter.extractAccountId(payload)).toBe('shop_123');
    });

    it('should return unknown for empty payload', () => {
      expect(adapter.extractAccountId({})).toBe('unknown');
    });
  });

  describe('extractEvents', () => {
    it('should extract text message event', () => {
      const payload = {
        type: 1, // New message event
        shop_id: 'shop_123',
        timestamp: 1234567890,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          message_type: TikTokMessageType.TEXT,
          content: { text: 'Hello TikTok' },
          sender: {
            id: 'user_456',
            name: 'Test User',
            avatar_url: 'https://tiktok.com/avatar.jpg',
          },
          create_time: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('user_456');
      expect((events[0] as any).messageType).toBe(MessageType.TEXT);
      expect((events[0] as any).content.text).toBe('Hello TikTok');
    });

    it('should extract image message event', () => {
      const payload = {
        type: 1,
        shop_id: 'shop_123',
        timestamp: 1234567890,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          message_type: TikTokMessageType.IMAGE,
          content: {
            image_info: {
              image_url: 'https://tiktok.com/image.jpg',
              width: 800,
              height: 600,
            },
          },
          sender: { id: 'user_456', name: 'Test User' },
          create_time: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.IMAGE);
      expect((events[0] as any).content.mediaUrl).toBe('https://tiktok.com/image.jpg');
    });

    it('should extract video message event', () => {
      const payload = {
        type: 1,
        shop_id: 'shop_123',
        timestamp: 1234567890,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          message_type: TikTokMessageType.VIDEO,
          content: {
            video_info: {
              video_url: 'https://tiktok.com/video.mp4',
              cover_url: 'https://tiktok.com/cover.jpg',
              duration: 30,
            },
          },
          sender: { id: 'user_456', name: 'Test User' },
          create_time: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.VIDEO);
      expect((events[0] as any).content.mediaUrl).toBe('https://tiktok.com/video.mp4');
      expect((events[0] as any).content.thumbnailUrl).toBe('https://tiktok.com/cover.jpg');
    });

    it('should handle product card message', () => {
      const payload = {
        type: 1,
        shop_id: 'shop_123',
        timestamp: 1234567890,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          message_type: TikTokMessageType.PRODUCT_CARD,
          content: {
            product_info: {
              product_id: 'prod_123',
              product_name: 'Test Product',
            },
          },
          sender: { id: 'user_456', name: 'Test User' },
          create_time: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.TEMPLATE);
      expect((events[0] as any).content.text).toContain('Test Product');
    });

    it('should return empty array for non-message events', () => {
      const payload = {
        type: 2, // Not a message event
        shop_id: 'shop_123',
        data: {},
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should return empty array if message_id is missing', () => {
      const payload = {
        type: 1,
        shop_id: 'shop_123',
        data: {},
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });
  });

  describe('normalizeMessage', () => {
    it('should normalize message event correctly', () => {
      const event = {
        type: 'message' as const,
        senderId: 'user_456',
        recipientId: 'shop_123',
        timestamp: new Date(1234567890000),
        messageId: 'msg_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello TikTok' },
        rawPayload: {
          data: {
            conversation_id: 'conv_123',
            sender: {
              name: 'Test User',
              avatar_url: 'https://tiktok.com/avatar.jpg',
            },
          },
        },
      };

      const normalized = adapter.normalizeMessage(event);

      expect(normalized.platformMessageId).toBe('msg_123');
      expect(normalized.conversationKey).toBe('conv_123');
      expect(normalized.direction).toBe(MessageDirection.INBOUND);
      expect(normalized.type).toBe(MessageType.TEXT);
      expect(normalized.metadata.senderName).toBe('Test User');
    });
  });

  describe('getConversationKey', () => {
    it('should use conversation_id from payload if available', () => {
      const key = adapter.getConversationKey('user_456', 'shop_123', {
        data: { conversation_id: 'conv_123' },
      });
      expect(key).toBe('conv_123');
    });

    it('should fallback to senderId_recipientId', () => {
      const key = adapter.getConversationKey('user_456', 'shop_123');
      expect(key).toBe('user_456_shop_123');
    });
  });

  describe('formatOutbound', () => {
    it('should format text message correctly', () => {
      const message = {
        type: MessageType.TEXT,
        content: { text: 'Hello from shop!' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message_type).toBe(TikTokMessageType.TEXT);
      expect(payload.content).toEqual({ text: 'Hello from shop!' });
    });

    it('should format image message correctly', () => {
      const message = {
        type: MessageType.IMAGE,
        content: { mediaUrl: 'https://example.com/image.jpg' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message_type).toBe(TikTokMessageType.IMAGE);
      expect(payload.content).toEqual({
        image_info: { image_url: 'https://example.com/image.jpg' },
      });
    });

    it('should format video message correctly', () => {
      const message = {
        type: MessageType.VIDEO,
        content: { mediaUrl: 'https://example.com/video.mp4' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message_type).toBe(TikTokMessageType.VIDEO);
      expect(payload.content).toEqual({
        video_info: { video_url: 'https://example.com/video.mp4' },
      });
    });
  });
});
