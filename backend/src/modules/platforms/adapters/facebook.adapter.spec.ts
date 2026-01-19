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

    it('should extract comment events from changes array', () => {
      // Facebook feed webhook payload structure per real examples
      // Reference: https://github.com/restfb/restfb/issues/741
      // Note: sender_id can be number or string, post_id format: {page_id}_{post_id}
      // Real Facebook IDs are large numbers but JSON parses them - use string in tests
      const payload = {
        object: 'page',
        entry: [{
          id: '436913053309741', // page_id
          time: 1497326228000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment', // Required: identifies event type
              verb: 'add',
              sender_id: '10206635083634304', // String to avoid JS precision issues
              sender_name: 'Test User',
              post_id: '436913053309741_446163252384721', // Format: {page_id}_{post_id}
              comment_id: '446163252384721_447508348916878', // Format: {post_id}_{comment_id}
              message: 'Nice post!',
              created_time: 1497326228, // Unix timestamp (seconds)
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('message');
      expect(events[0].senderId).toBe('10206635083634304');
      expect((events[0] as any).rawPayload.isComment).toBe(true);
      expect((events[0] as any).rawPayload.post_id).toBe('436913053309741_446163252384721');
    });

    it('should skip non-comment feed events (posts, shares, reactions)', () => {
      // Facebook sends various item types: comment, post, share, reaction, etc.
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'post', // Not a comment - should be skipped
              verb: 'add',
              sender_id: 'user_456',
              post_id: 'post_789',
              message: 'New post',
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should skip comments from page itself', () => {
      // Per Facebook docs, sender_id === page_id means the page owner commented
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              sender_id: 'page_123', // Same as page ID - page owner
              sender_name: 'My Page',
              post_id: 'post_789',
              comment_id: 'comment_abc',
              message: 'Thanks for commenting!',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should skip comment edits (verb === edit or edited)', () => {
      // Facebook sends verb: "edit" or "edited" for comment modifications
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'edit', // or 'edited'
              sender_id: 'user_456',
              post_id: 'post_789',
              comment_id: 'comment_abc',
              message: 'Edited comment',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should skip comment removals (verb === remove or delete)', () => {
      // Facebook sends verb: "remove" or "delete" for deleted comments
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'remove', // or 'delete'
              sender_id: 'user_456',
              post_id: 'post_789',
              comment_id: 'comment_abc',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should handle comments field as well as feed field', () => {
      // Facebook can send comments via field: "comments" or field: "feed"
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'comments', // Alternative to 'feed'
            value: {
              item: 'comment',
              verb: 'add',
              sender_id: 'user_456',
              sender_name: 'Test User',
              post_id: 'post_789',
              comment_id: 'comment_abc',
              message: 'Great!',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).rawPayload.isComment).toBe(true);
    });

    it('should mark top-level comments with isReply=false (parent_id === post_id)', () => {
      // Per Facebook docs: parent_id === post_id means top-level comment
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              sender_id: 'user_456',
              post_id: 'page_123_post_789', // Format: {page_id}_{post_id}
              parent_id: 'page_123_post_789', // Same as post_id = top-level
              comment_id: 'page_123_post_789_comment_abc',
              message: 'Top level comment',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).rawPayload.isReply).toBe(false);
      expect((events[0] as any).rawPayload.parent_id).toBe('page_123_post_789');
    });

    it('should mark reply comments with isReply=true (parent_id !== post_id)', () => {
      // Per Facebook docs: parent_id !== post_id means reply to another comment
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              sender_id: 'user_456',
              post_id: 'page_123_post_789',
              parent_id: 'page_123_post_789_comment_xyz', // Different = reply to comment
              comment_id: 'page_123_post_789_comment_abc',
              message: 'Reply to another comment',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).rawPayload.isReply).toBe(true);
      expect((events[0] as any).rawPayload.parent_id).toBe('page_123_post_789_comment_xyz');
    });

    it('should handle from.id format (newer Facebook format for posts)', () => {
      // Facebook may use from.id/from.name instead of sender_id/sender_name
      // This format is more common in post webhooks but also used in comments
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              from: { id: 'user_456', name: 'Test User' }, // Newer format
              post_id: 'post_789',
              comment_id: 'comment_abc',
              message: 'Using from.id format',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect(events[0].senderId).toBe('user_456');
      expect((events[0] as any).rawPayload.sender_id).toBe('user_456');
      expect((events[0] as any).rawPayload.sender_name).toBe('Test User');
    });

    it('should skip reaction events (item === reaction)', () => {
      // Facebook sends reaction events with item: "reaction"
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              item: 'reaction',
              verb: 'add',
              sender_id: 'user_456',
              post_id: 'post_789',
              reaction_type: 'like',
              created_time: 1234567890,
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(0);
    });

    it('should handle legacy format without item field', () => {
      // Some older Facebook webhooks may not include item field
      // We should still process them as comments if they have comment_id
      const payload = {
        object: 'page',
        entry: [{
          id: 'page_123',
          time: 1234567890000,
          changes: [{
            field: 'feed',
            value: {
              verb: 'add',
              sender_id: 'user_456',
              sender_name: 'Test User',
              post_id: 'post_789',
              comment_id: 'comment_abc', // Has comment_id but no item field
              message: 'Legacy format comment',
            },
          }],
        }],
      };

      const events = adapter.extractEvents(payload);
      expect(events).toHaveLength(1);
      expect((events[0] as any).rawPayload.isComment).toBe(true);
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
