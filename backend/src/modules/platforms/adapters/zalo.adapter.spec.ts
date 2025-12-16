import { Test, TestingModule } from '@nestjs/testing';
import { ZaloAdapter } from './zalo.adapter';
import { EnvService } from '@/common/env';
import { Platform, MessageType, MessageDirection } from '@/common/constants';

describe('ZaloAdapter', () => {
  let adapter: ZaloAdapter;

  const mockEnvService = {
    get: jest.fn((key: string) => {
      const env: Record<string, string> = {
        ZALO_APP_SECRET: 'test_app_secret',
      };
      return env[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZaloAdapter,
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    adapter = module.get<ZaloAdapter>(ZaloAdapter);
  });

  describe('platform', () => {
    it('should return ZALO platform', () => {
      expect(adapter.platform).toBe(Platform.ZALO);
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

    it('should return false for invalid signature', () => {
      expect(adapter.verifySignature('body', 'invalid_signature', 'secret')).toBe(false);
    });
  });

  describe('extractAccountId', () => {
    it('should extract OA ID from recipient.id', () => {
      const payload = {
        app_id: 'app_123',
        recipient: { id: 'oa_456' },
        sender: { id: 'user_789' },
      };
      expect(adapter.extractAccountId(payload)).toBe('oa_456');
    });

    it('should fallback to app_id if recipient.id is missing', () => {
      const payload = {
        app_id: 'app_123',
        sender: { id: 'user_789' },
      };
      expect(adapter.extractAccountId(payload)).toBe('app_123');
    });

    it('should return unknown for empty payload', () => {
      expect(adapter.extractAccountId({})).toBe('unknown');
    });
  });

  describe('extractEvents', () => {
    it('should extract text message event', () => {
      const payload = {
        app_id: 'app_123',
        event_name: 'user_send_text',
        sender: { id: 'user_789' },
        recipient: { id: 'oa_456' },
        timestamp: '1234567890000',
        message: {
          msg_id: 'msg_123',
          text: 'Hello Zalo',
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('user_789');
      expect((events[0] as any).messageType).toBe(MessageType.TEXT);
      expect((events[0] as any).content.text).toBe('Hello Zalo');
    });

    it('should extract image message event', () => {
      const payload = {
        app_id: 'app_123',
        event_name: 'user_send_image',
        sender: { id: 'user_789' },
        recipient: { id: 'oa_456' },
        timestamp: '1234567890000',
        message: {
          msg_id: 'msg_123',
          attachments: [{
            type: 'image',
            payload: { url: 'https://zalo.me/image.jpg' },
          }],
        },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).messageType).toBe(MessageType.IMAGE);
      expect((events[0] as any).content.mediaUrl).toBe('https://zalo.me/image.jpg');
    });

    it('should extract delivery event', () => {
      const payload = {
        app_id: 'app_123',
        event_name: 'user_received_message',
        sender: { id: 'user_789' },
        recipient: { id: 'oa_456' },
        timestamp: '1234567890000',
        message: { msg_id: 'msg_123' },
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('delivery');
    });

    it('should extract read event', () => {
      const payload = {
        app_id: 'app_123',
        event_name: 'user_seen_message',
        sender: { id: 'user_789' },
        recipient: { id: 'oa_456' },
        timestamp: '1234567890000',
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('read');
    });

    it('should return empty array if sender/recipient is missing', () => {
      const payload = {
        app_id: 'app_123',
        event_name: 'user_send_text',
        timestamp: '1234567890000',
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });
  });

  describe('normalizeMessage', () => {
    it('should normalize message event correctly', () => {
      const event = {
        type: 'message' as const,
        senderId: 'user_789',
        recipientId: 'oa_456',
        timestamp: new Date(1234567890000),
        messageId: 'msg_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello Zalo' },
        rawPayload: {},
      };

      const normalized = adapter.normalizeMessage(event);

      expect(normalized.platformMessageId).toBe('msg_123');
      expect(normalized.conversationKey).toBe('user_789_oa_456');
      expect(normalized.direction).toBe(MessageDirection.INBOUND);
      expect(normalized.type).toBe(MessageType.TEXT);
    });
  });

  describe('getConversationKey', () => {
    it('should generate correct conversation key', () => {
      const key = adapter.getConversationKey('user_789', 'oa_456');
      expect(key).toBe('user_789_oa_456');
    });
  });

  describe('formatOutbound', () => {
    it('should format text message correctly', () => {
      const message = {
        type: MessageType.TEXT,
        content: { text: 'Hello from OA!' },
      };

      const payload = adapter.formatOutbound(message);
      expect(payload.message).toEqual({ text: 'Hello from OA!' });
    });

    it('should format image message correctly', () => {
      const message = {
        type: MessageType.IMAGE,
        content: { mediaUrl: 'https://example.com/image.jpg' },
      };

      const payload = adapter.formatOutbound(message);
      // Zalo requires template media format for images
      expect(payload.message).toEqual({
        attachment: {
          type: 'template',
          payload: {
            template_type: 'media',
            elements: [
              {
                media_type: 'image',
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        },
      });
    });
  });
});
