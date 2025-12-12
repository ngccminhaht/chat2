import { Test, TestingModule } from '@nestjs/testing';
import { ShopeeAdapter } from './shopee.adapter';
import { EnvService } from '@/common/env';
import { Platform, MessageType, MessageDirection } from '@/common/constants';

describe('ShopeeAdapter', () => {
  let adapter: ShopeeAdapter;

  const mockEnvService = {
    get: jest.fn((key: string) => {
      const env: Record<string, string> = {
        SHOPEE_PARTNER_KEY: 'test_partner_key',
        SHOPEE_ENV: 'test',
      };
      return env[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopeeAdapter,
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    adapter = module.get<ShopeeAdapter>(ShopeeAdapter);
  });

  describe('platform', () => {
    it('should return SHOPEE platform', () => {
      expect(adapter.platform).toBe(Platform.SHOPEE);
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
        shop_id: 123456,
        data: { message_id: 'msg_123' },
      };
      expect(adapter.extractAccountId(payload)).toBe('123456');
    });

    it('should return unknown for empty payload', () => {
      expect(adapter.extractAccountId({})).toBe('unknown');
    });
  });

  describe('extractEvents', () => {
    it('should extract text message event', () => {
      const payload = {
        shop_id: 123456,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          from_id: 789,
          to_id: 123456,
          message_type: 1, // TEXT
          content: 'Hello Shopee',
          created_timestamp: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('789');
      expect((events[0] as any).messageType).toBe(MessageType.TEXT);
      expect((events[0] as any).content.text).toBe('Hello Shopee');
    });

    it('should extract image message event', () => {
      const payload = {
        shop_id: 123456,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          from_id: 789,
          to_id: 123456,
          message_type: 2, // IMAGE
          content: 'https://shopee.com/image.jpg',
          created_timestamp: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.IMAGE);
      expect((events[0] as any).content.mediaUrl).toBe('https://shopee.com/image.jpg');
    });

    it('should handle sticker message', () => {
      const payload = {
        shop_id: 123456,
        data: {
          conversation_id: 'conv_123',
          message_id: 'msg_123',
          from_id: 789,
          to_id: 123456,
          message_type: 5, // STICKER
          content: 'sticker_id',
          created_timestamp: 1234567890,
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.STICKER);
    });

    it('should return empty array if message_id is missing', () => {
      const payload = {
        shop_id: 123456,
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
        senderId: '789',
        recipientId: '123456',
        timestamp: new Date(1234567890000),
        messageId: 'msg_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello Shopee' },
        rawPayload: {
          data: { conversation_id: 'conv_123' },
        },
      };

      const normalized = adapter.normalizeMessage(event);

      expect(normalized.platformMessageId).toBe('msg_123');
      expect(normalized.conversationKey).toBe('conv_123');
      expect(normalized.direction).toBe(MessageDirection.INBOUND);
      expect(normalized.type).toBe(MessageType.TEXT);
    });

    it('should fallback to senderId_recipientId if conversation_id is missing', () => {
      const event = {
        type: 'message' as const,
        senderId: '789',
        recipientId: '123456',
        timestamp: new Date(1234567890000),
        messageId: 'msg_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello' },
        rawPayload: { data: {} },
      };

      const normalized = adapter.normalizeMessage(event);
      expect(normalized.conversationKey).toBe('789_123456');
    });
  });

  describe('getConversationKey', () => {
    it('should use conversation_id from payload if available', () => {
      const key = adapter.getConversationKey('789', '123456', {
        data: { conversation_id: 'conv_123' },
      });
      expect(key).toBe('conv_123');
    });

    it('should fallback to senderId_recipientId', () => {
      const key = adapter.getConversationKey('789', '123456');
      expect(key).toBe('789_123456');
    });
  });

  describe('formatOutbound', () => {
    it('should format text message correctly', () => {
      const message = {
        type: MessageType.TEXT,
        content: { text: 'Hello from shop!' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.content).toBe('Hello from shop!');
      expect(payload.message_type).toBe('text');
    });

    it('should format image message correctly', () => {
      const message = {
        type: MessageType.IMAGE,
        content: { mediaUrl: 'https://example.com/image.jpg' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.content).toBe('https://example.com/image.jpg');
      expect(payload.message_type).toBe('image');
    });
  });
});
