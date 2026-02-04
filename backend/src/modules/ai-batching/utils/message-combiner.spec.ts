/**
 * MessageCombiner Unit Tests
 * Tests platform label detection for Facebook inbox vs comment messages
 */

import { MessageCombiner } from './message-combiner';
import { Platform } from '@/common/constants';

describe('MessageCombiner', () => {
  const mockConversation: any = {
    _id: '507f1f77bcf86cd799439011',
    platform: Platform.FACEBOOK,
    platformConversationId: 'user123_page456',
    organizationId: '507f1f77bcf86cd799439012',
  };

  describe('getPlatformLabel - Facebook inbox vs comment detection', () => {
    it('should identify FACEBOOK:INBOX when message has isComment=false', () => {
      const inboxMessage: any = {
        _id: 'msg_inbox_1',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Hello from inbox' },
        sender: { name: 'John Doe', platformUserId: 'user123' },
        createdAt: new Date('2024-01-01T10:00:00Z'),
        metadata: {
          isComment: false,
          rawPayload: { isComment: false },
        },
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: inboxMessage },
      ]);

      expect(result.texts[0].content).toContain('[FACEBOOK:INBOX]');
      expect(result.texts[0].content).toContain('John Doe:');
      expect(result.texts[0].content).toContain('Hello from inbox');
    });

    it('should identify FACEBOOK:COMMENT when message has isComment=true', () => {
      const commentMessage: any = {
        _id: 'msg_comment_1',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Hello from comment' },
        sender: { name: 'Jane Doe', platformUserId: 'user456' },
        createdAt: new Date('2024-01-01T10:01:00Z'),
        metadata: {
          isComment: true,
          postId: 'post_123',
          rawPayload: { isComment: true, post_id: 'post_123' },
        },
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: commentMessage },
      ]);

      expect(result.texts[0].content).toContain('[FACEBOOK:COMMENT]');
      expect(result.texts[0].content).toContain('Jane Doe:');
      expect(result.texts[0].content).toContain('Hello from comment');
    });

    it('should handle mixed inbox and comment messages in same batch', () => {
      const inboxMessage: any = {
        _id: 'msg_inbox_1',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Inbox message' },
        sender: { name: 'User A', platformUserId: 'user123' },
        createdAt: new Date('2024-01-01T10:00:00Z'),
        metadata: {
          isComment: false,
        },
      };

      const commentMessage: any = {
        _id: 'msg_comment_1',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Comment message' },
        sender: { name: 'User A', platformUserId: 'user123' },
        createdAt: new Date('2024-01-01T10:01:00Z'),
        metadata: {
          isComment: true,
          postId: 'post_123',
        },
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: inboxMessage },
        { conversation: mockConversation, message: commentMessage },
      ]);

      const combinedText = result.texts[0].content;

      // Should contain both labels
      expect(combinedText).toContain('[FACEBOOK:INBOX]');
      expect(combinedText).toContain('[FACEBOOK:COMMENT]');

      // Should be in correct order
      const inboxIndex = combinedText.indexOf('[FACEBOOK:INBOX]');
      const commentIndex = combinedText.indexOf('[FACEBOOK:COMMENT]');
      expect(inboxIndex).toBeLessThan(commentIndex);
    });

    it('should default to FACEBOOK:INBOX when metadata is missing', () => {
      const messageWithoutMetadata: any = {
        _id: 'msg_no_metadata',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Message without metadata' },
        sender: { name: 'User B', platformUserId: 'user789' },
        createdAt: new Date('2024-01-01T10:02:00Z'),
        // No metadata
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: messageWithoutMetadata },
      ]);

      expect(result.texts[0].content).toContain('[FACEBOOK:INBOX]');
    });

    it('should check rawPayload.isComment if metadata.isComment is missing', () => {
      const messageWithRawPayloadOnly: any = {
        _id: 'msg_raw_payload',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Message with rawPayload only' },
        sender: { name: 'User C', platformUserId: 'user999' },
        createdAt: new Date('2024-01-01T10:03:00Z'),
        metadata: {
          // No direct isComment field
          rawPayload: {
            isComment: true, // But has it in rawPayload
            post_id: 'post_456',
          },
        },
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: messageWithRawPayloadOnly },
      ]);

      expect(result.texts[0].content).toContain('[FACEBOOK:COMMENT]');
    });
  });

  describe('combineMessages - latestMessage metadata', () => {
    it('should include latest message in latestMessage field', () => {
      const message1: any = {
        _id: 'msg_1',
        type: 'text',
        direction: 'inbound',
        content: { text: 'First message' },
        sender: { name: 'User', platformUserId: 'user123' },
        createdAt: new Date('2024-01-01T10:00:00Z'),
        metadata: { isComment: false },
      };

      const message2: any = {
        _id: 'msg_2',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Second message' },
        sender: { name: 'User', platformUserId: 'user123' },
        createdAt: new Date('2024-01-01T10:01:00Z'),
        metadata: { isComment: true },
      };

      const result = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: message1 },
        { conversation: mockConversation, message: message2 },
      ]);

      expect(result.latestMessage.message._id).toBe('msg_2');
      expect(result.latestMessage.message.metadata.isComment).toBe(true);
    });
  });

  describe('createAIRequest - platform label in customer context', () => {
    it('should include correct platform label in customer_info', () => {
      const inboxMessage: any = {
        _id: 'msg_inbox',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Test message' },
        sender: { name: 'Test User', platformUserId: 'test123' },
        createdAt: new Date(),
        metadata: { isComment: false },
      };

      const combinedData = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: inboxMessage },
      ]);

      const aiRequest = MessageCombiner.createAIRequest(
        combinedData,
        { username: 'Test User', _id: 'test123' },
        null,
        3
      );

      expect(aiRequest.inputs?.customer_info).toContain('from: FACEBOOK:INBOX');
    });

    it('should use FACEBOOK:COMMENT label for comment messages', () => {
      const commentMessage: any = {
        _id: 'msg_comment',
        type: 'text',
        direction: 'inbound',
        content: { text: 'Comment text' },
        sender: { name: 'Commenter', platformUserId: 'commenter123' },
        createdAt: new Date(),
        metadata: { isComment: true, postId: 'post_abc' },
      };

      const combinedData = MessageCombiner.combineMessages([
        { conversation: mockConversation, message: commentMessage },
      ]);

      const aiRequest = MessageCombiner.createAIRequest(
        combinedData,
        { username: 'Commenter', _id: 'commenter123' },
        null,
        3
      );

      expect(aiRequest.inputs?.customer_info).toContain('from: FACEBOOK:COMMENT');
    });
  });
});
