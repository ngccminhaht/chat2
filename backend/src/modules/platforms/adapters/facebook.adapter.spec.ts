import { Test, TestingModule } from '@nestjs/testing';
import { FacebookAdapter } from './facebook.adapter';
import { EnvService } from '@/common/env';
import { Platform, MessageType, MessageDirection } from '@/common/constants';

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter;

  const mockEnvService = {
    get: jest.fn((key: string) => {
      const env: Record<string, string> = {
        FACEBOOK_APP_SECRET: 'test_app_secret',
      };
      return env[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookAdapter,
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    adapter = module.get<FacebookAdapter>(FacebookAdapter);
  });

  describe('platform', () => {
    it('should return FACEBOOK platform', () => {
      expect(adapter.platform).toBe(Platform.FACEBOOK);
    });
  });

  describe('verifySignature', () => {
    it('should return false if signature is empty', () => {
      expect(adapter.verifySignature('body', '', 'secret')).toBe(false);
    });

    it('should return false if signature format is invalid', () => {
      expect(adapter.verifySignature('body', 'invalid', 'secret')).toBe(false);
    });

    it('should return false if algorithm is not sha256', () => {
      expect(adapter.verifySignature('body', 'sha1=abc', 'secret')).toBe(false);
    });

    it('should verify valid signature correctly', () => {
      const crypto = require('crypto');
      const body = '{"test":"data"}';
      const secret = 'test_secret';
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(body);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(adapter.verifySignature(body, signature, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      expect(adapter.verifySignature('body', 'sha256=invalid', 'secret')).toBe(false);
    });
  });

  describe('extractAccountId', () => {
    it('should extract page ID from webhook payload', () => {
      const payload = {
        object: 'page',
        entry: [{ id: 'page_123', time: Date.now() }],
      };
      expect(adapter.extractAccountId(payload)).toBe('page_123');
    });

    it('should return unknown for empty payload', () => {
      expect(adapter.extractAccountId({})).toBe('unknown');
    });

    it('should return unknown for empty entry array', () => {
      const payload = { object: 'page', entry: [] };
      expect(adapter.extractAccountId(payload)).toBe('unknown');
    });
  });

  describe('extractEvents', () => {
    it('should return empty array for non-page object', () => {
      const payload = { object: 'user', entry: [] };
      expect(adapter.extractEvents(payload)).toEqual([]);
    });

    it('should extract message events from messaging array', () => {
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          messaging: [{
            sender: { id: 'user_456' },
            recipient: { id: 'page_123' },
            timestamp: 1234567890000,
            message: {
              mid: 'm_123',
              text: 'Hello',
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('user_456');
      expect(events[0].recipientId).toBe('page_123');
    });

    it('should extract delivery events', () => {
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          messaging: [{
            sender: { id: 'user_456' },
            recipient: { id: 'page_123' },
            timestamp: 1234567890000,
            delivery: {
              mids: ['m_123', 'm_456'],
              watermark: 1234567890000,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('delivery');
      expect((events[0] as any).messageIds).toEqual(['m_123', 'm_456']);
    });

    it('should extract read events', () => {
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          messaging: [{
            sender: { id: 'user_456' },
            recipient: { id: 'page_123' },
            timestamp: 1234567890000,
            read: {
              watermark: 1234567890000,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('read');
    });

    it('should skip echo messages', () => {
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          messaging: [{
            sender: { id: 'page_123' },
            recipient: { id: 'user_456' },
            timestamp: 1234567890000,
            message: {
              mid: 'm_123',
              text: 'Hello',
              is_echo: true,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should handle image attachments', () => {
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          messaging: [{
            sender: { id: 'user_456' },
            recipient: { id: 'page_123' },
            timestamp: 1234567890000,
            message: {
              mid: 'm_123',
              attachments: [{
                type: 'image',
                payload: { url: 'https://example.com/image.jpg' },
              }],
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.IMAGE);
      expect((events[0] as any).content.mediaUrl).toBe('https://example.com/image.jpg');
    });
  });

  describe('normalizeMessage', () => {
    it('should normalize message event correctly', () => {
      const event = {
        type: 'message' as const,
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(1234567890000),
        messageId: 'm_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello' },
        rawPayload: {},
      };

      const normalized = adapter.normalizeMessage(event);

      expect(normalized.platformMessageId).toBe('m_123');
      expect(normalized.conversationKey).toBe('user_456_page_123');
      expect(normalized.direction).toBe(MessageDirection.INBOUND);
      expect(normalized.type).toBe(MessageType.TEXT);
      expect(normalized.content.text).toBe('Hello');
    });
  });

  describe('getConversationKey', () => {
    it('should generate correct conversation key for direct messages', () => {
      const key = adapter.getConversationKey('user_456', 'page_123');
      expect(key).toBe('user_456_page_123');
    });

    it('should generate post-based key for comments', () => {
      const key = adapter.getConversationKey('user_456', 'page_123', { postId: 'post_789' });
      expect(key).toBe('post_post_789_page_123');
    });
  });

  describe('formatOutbound', () => {
    it('should format text message correctly', () => {
      const message = {
        type: MessageType.TEXT,
        content: { text: 'Hello!' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message).toEqual({ text: 'Hello!' });
    });

    it('should format image message correctly', () => {
      const message = {
        type: MessageType.IMAGE,
        content: { mediaUrl: 'https://example.com/image.jpg' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message).toEqual({
        attachment: {
          type: 'image',
          payload: {
            url: 'https://example.com/image.jpg',
            is_reusable: true,
          },
        },
      });
    });
  });
});
