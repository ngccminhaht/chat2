import { Test, TestingModule } from '@nestjs/testing';
import { WebPlatformAdapter, WebMessagePayload } from './web.adapter';
import { Platform, MessageType, MessageDirection } from '@/common/constants';

describe('WebPlatformAdapter', () => {
  let adapter: WebPlatformAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebPlatformAdapter],
    }).compile();

    adapter = module.get<WebPlatformAdapter>(WebPlatformAdapter);
  });

  describe('platform', () => {
    it('should have platform set to WEB', () => {
      expect(adapter.platform).toBe(Platform.WEB);
    });
  });

  describe('verifySignature', () => {
    it('should always return true (WebSocket auth handles this)', () => {
      expect(adapter.verifySignature()).toBe(true);
    });
  });

  describe('extractAccountId', () => {
    it('should extract organizationId from payload', () => {
      const payload: WebMessagePayload = {
        visitorId: 'visitor123',
        organizationId: 'org456',
      };

      expect(adapter.extractAccountId(payload)).toBe('org456');
    });

    it('should return "unknown" if organizationId is missing', () => {
      const payload = { visitorId: 'visitor123' };
      expect(adapter.extractAccountId(payload)).toBe('unknown');
    });
  });

  describe('extractEvents', () => {
    it('should extract message event from valid payload', () => {
      const payload: WebMessagePayload = {
        visitorId: 'visitor123',
        organizationId: 'org456',
        messageId: 'msg789',
        type: MessageType.TEXT,
        text: 'Hello, world!',
        timestamp: 1702723200000,
      };

      const events = adapter.extractEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('visitor123');
      expect(events[0].recipientId).toBe('org456');
      expect(events[0].messageId).toBe('msg789');
    });

    it('should return empty array if visitorId is missing', () => {
      const payload = { organizationId: 'org456', text: 'Hello' };
      expect(adapter.extractEvents(payload)).toHaveLength(0);
    });

    it('should return empty array if organizationId is missing', () => {
      const payload = { visitorId: 'visitor123', text: 'Hello' };
      expect(adapter.extractEvents(payload)).toHaveLength(0);
    });

    it('should generate messageId if not provided', () => {
      const payload: WebMessagePayload = {
        visitorId: 'visitor123',
        organizationId: 'org456',
        text: 'Hello',
      };

      const events = adapter.extractEvents(payload);
      expect(events[0].messageId).toBeDefined();
      expect(events[0].messageId.length).toBeGreaterThan(0);
    });

    it('should default to TEXT type if not provided', () => {
      const payload: WebMessagePayload = {
        visitorId: 'visitor123',
        organizationId: 'org456',
        text: 'Hello',
      };

      const events = adapter.extractEvents(payload);
      expect((events[0] as any).messageType).toBe(MessageType.TEXT);
    });

    it('should handle media messages', () => {
      const payload: WebMessagePayload = {
        visitorId: 'visitor123',
        organizationId: 'org456',
        type: MessageType.IMAGE,
        mediaUrl: 'https://example.com/image.jpg',
        mediaType: 'image/jpeg',
        fileName: 'photo.jpg',
        fileSize: 102400,
      };

      const events = adapter.extractEvents(payload);
      const event = events[0] as any;

      expect(event.messageType).toBe(MessageType.IMAGE);
      expect(event.content.mediaUrl).toBe('https://example.com/image.jpg');
      expect(event.content.mediaType).toBe('image/jpeg');
      expect(event.content.fileName).toBe('photo.jpg');
      expect(event.content.fileSize).toBe(102400);
    });
  });

  describe('normalizeMessage', () => {
    it('should normalize message event to internal format', () => {
      const messageEvent = {
        type: 'message' as const,
        senderId: 'visitor123',
        recipientId: 'org456',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        messageId: 'msg789',
        messageType: MessageType.TEXT,
        content: { text: 'Hello!' },
        rawPayload: {},
      };

      const normalized = adapter.normalizeMessage(messageEvent);

      expect(normalized.platformMessageId).toBe('msg789');
      expect(normalized.conversationKey).toBe('web_org456_visitor123');
      expect(normalized.direction).toBe(MessageDirection.INBOUND);
      expect(normalized.type).toBe(MessageType.TEXT);
      expect(normalized.senderId).toBe('visitor123');
      expect(normalized.recipientId).toBe('org456');
      expect(normalized.content.text).toBe('Hello!');
      expect(normalized.metadata.platform).toBe(Platform.WEB);
    });
  });

  describe('getConversationKey', () => {
    it('should generate web conversation key', () => {
      const key = adapter.getConversationKey('visitor123', 'org456');
      expect(key).toBe('web_org456_visitor123');
    });
  });

  describe('formatOutbound', () => {
    it('should format text message for outbound', () => {
      const message = {
        type: MessageType.TEXT,
        content: { text: 'Reply message' },
      };

      const payload = adapter.formatOutbound(message);

      expect(payload.type).toBe(MessageType.TEXT);
      expect(payload.text).toBe('Reply message');
    });

    it('should format media message for outbound', () => {
      const message = {
        type: MessageType.IMAGE,
        content: {
          mediaUrl: 'https://example.com/image.jpg',
          mediaType: 'image/jpeg',
          fileName: 'image.jpg',
        },
      };

      const payload = adapter.formatOutbound(message);

      expect(payload.type).toBe(MessageType.IMAGE);
      expect(payload.mediaUrl).toBe('https://example.com/image.jpg');
      expect(payload.mediaType).toBe('image/jpeg');
      expect(payload.fileName).toBe('image.jpg');
    });
  });

  describe('send', () => {
    it('should return success with generated messageId', async () => {
      const result = await adapter.send({} as any, 'visitor123', {});

      expect(result.success).toBe(true);
      expect(result.platformMessageId).toBeDefined();
      expect(result.platformMessageId.length).toBeGreaterThan(0);
    });
  });

  describe('fetchUserProfile', () => {
    it('should return default visitor profile', async () => {
      const profile = await adapter.fetchUserProfile({} as any, 'visitor123');

      expect(profile.id).toBe('visitor123');
      expect(profile.name).toContain('Visitor');
    });
  });
});
