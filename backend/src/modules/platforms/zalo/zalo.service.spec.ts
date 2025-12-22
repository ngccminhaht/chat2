import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ZaloService } from './zalo.service';
import { Conversation } from '@/common/database/schemas/conversation.schema';
import { Message } from '@/common/database/schemas/message.schema';
import { PlatformConnection } from '@/common/database/schemas/platform-connection.schema';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { EnvService } from '@/common/env';
import { ZaloWebhookDto } from './dto/zalo-webhook.dto';
import { ConversationStatus, MessageStatus } from '@/common/constants';

describe('ZaloService', () => {
  let service: ZaloService;
  let conversationModel: any;
  let messageModel: any;
  let platformConnectionModel: any;
  let kafkaProducer: jest.Mocked<KafkaProducerService>;

  // Test data
  const mockOrgId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();
  const mockConnectionId = new Types.ObjectId();
  const mockConversationId = new Types.ObjectId();
  const mockMessageId = new Types.ObjectId();

  const mockPlatformConnection = {
    _id: mockConnectionId,
    platform: 'zalo',
    platformAccountId: 'oa123456',
    organizationId: mockOrgId,
    connectedBy: mockUserId,
    credentials: {
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-123',
    },
    status: 'active',
  };

  const mockConversation = {
    _id: mockConversationId,
    platform: 'zalo',
    platformConversationId: 'sender123_oa123456',
    platformConnectionId: mockConnectionId,
    organizationId: mockOrgId,
    customerPlatformUserId: 'sender123',
    customerName: 'Test User',
    status: ConversationStatus.OPEN,
    unreadCount: 0,
  };

  const mockMessage = {
    _id: mockMessageId,
    conversationId: mockConversationId,
    organizationId: mockOrgId,
    platform: 'zalo',
    platformMessageId: 'msg123',
    direction: 'inbound',
    type: 'text',
    content: { text: 'Hello' },
    sender: {
      platformUserId: 'sender123',
      name: 'Test User',
    },
    status: MessageStatus.SENT,
  };

  // Mock model factory
  const createMockModel = () => {
    const model: any = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ ...doc, _id: new Types.ObjectId() }),
    }));
    model.findOne = jest.fn().mockReturnValue({ exec: jest.fn() });
    model.findById = jest.fn().mockReturnValue({ exec: jest.fn() });
    model.findByIdAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn() });
    model.create = jest.fn();
    model.updateOne = jest.fn().mockReturnValue({ exec: jest.fn() });
    return model;
  };

  beforeEach(async () => {
    conversationModel = createMockModel();
    messageModel = createMockModel();
    platformConnectionModel = createMockModel();

    const mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const mockEnvService = {
      get: jest.fn().mockImplementation((key: string) => {
        const env: Record<string, string> = {
          ZALO_APP_ID: 'test-app-id',
          ZALO_APP_SECRET: 'test-app-secret',
          ZALO_REDIRECT_URI: 'http://localhost:3000/callback',
        };
        return env[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZaloService,
        { provide: getModelToken(Conversation.name), useValue: conversationModel },
        { provide: getModelToken(Message.name), useValue: messageModel },
        { provide: getModelToken(PlatformConnection.name), useValue: platformConnectionModel },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    service = module.get<ZaloService>(ZaloService);
    kafkaProducer = module.get(KafkaProducerService);

    jest.clearAllMocks();
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const data = '{"event_name":"user_send_text"}';
      const secret = 'test-secret';
      // Pre-computed HMAC-SHA256 of the data with secret
      const crypto = require('crypto');
      const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex');

      const result = service.verifySignature(data, expectedSig, secret);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const result = service.verifySignature('data', 'invalid-sig', 'secret');
      expect(result).toBe(false);
    });
  });

  describe('processWebhook', () => {
    const createWebhookPayload = (overrides = {}): ZaloWebhookDto => ({
      event_name: 'user_send_text',
      app_id: 'app123',
      sender: { id: 'sender123' },
      recipient: { id: 'oa123456' },
      message: { text: 'Hello', msg_id: 'msg123' },
      timestamp: Date.now().toString(),
      ...overrides,
    });

    it('should create new conversation and message for new sender', async () => {
      const payload = createWebhookPayload();

      // Mock platform connection lookup
      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      // Mock no existing conversation
      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Mock conversation create
      const newConversation = { ...mockConversation };
      conversationModel.create.mockResolvedValue(newConversation);

      // Mock no existing message (duplicate check)
      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Mock message create
      const newMessage = { ...mockMessage };
      messageModel.create.mockResolvedValue(newMessage);

      // Mock platform connection lookup for notification
      platformConnectionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      await service.processWebhook(payload);

      // Verify conversation was created
      expect(conversationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'zalo',
          customerPlatformUserId: 'sender123',
        }),
      );

      // Verify message was created
      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'zalo',
          platformMessageId: 'msg123',
          direction: 'inbound',
          type: 'text',
        }),
      );

      // Verify Kafka notification was published
      expect(kafkaProducer.publish).toHaveBeenCalled();
    });

    it('should add message to existing conversation', async () => {
      const payload = createWebhookPayload();

      // Mock platform connection
      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      // Mock existing conversation
      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      // Mock no duplicate message
      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Mock message create
      messageModel.create.mockResolvedValue(mockMessage);

      // Mock platform connection for notification
      platformConnectionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      await service.processWebhook(payload);

      // Should NOT create new conversation
      expect(conversationModel.create).not.toHaveBeenCalled();

      // Should create message
      expect(messageModel.create).toHaveBeenCalled();
    });

    it('should skip duplicate messages', async () => {
      const payload = createWebhookPayload();

      // Mock platform connection
      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      // Mock existing conversation
      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      // Mock duplicate message exists
      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockMessage),
      });

      await service.processWebhook(payload);

      // Should NOT create message
      expect(messageModel.create).not.toHaveBeenCalled();
    });

    it('should throw error when platform connection not found', async () => {
      const payload = createWebhookPayload();

      // Mock no platform connection
      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.processWebhook(payload)).rejects.toThrow();
    });

    it('should throw error when OA ID is missing', async () => {
      const payload = createWebhookPayload({
        recipient: undefined,
      });

      await expect(service.processWebhook(payload)).rejects.toThrow(
        'Missing OA ID in webhook payload',
      );
    });

    it('should update conversation lastMessage and unreadCount', async () => {
      const payload = createWebhookPayload();

      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      messageModel.create.mockResolvedValue(mockMessage);

      conversationModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      platformConnectionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      await service.processWebhook(payload);

      expect(conversationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockConversationId,
        expect.objectContaining({
          lastMessage: expect.objectContaining({
            text: 'Hello',
          }),
          $inc: { unreadCount: 1 },
        }),
      );
    });

    it('should publish WebSocket notifications via Kafka', async () => {
      const payload = createWebhookPayload();

      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      messageModel.create.mockResolvedValue(mockMessage);

      platformConnectionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      await service.processWebhook(payload);

      // Should publish message:new event (Kafka publish uses {key, value} format)
      expect(kafkaProducer.publish).toHaveBeenCalledWith(
        'websocket.notifications',
        expect.objectContaining({
          key: mockUserId.toString(),
          value: expect.objectContaining({
            type: 'message:new',
            userId: mockUserId.toString(),
          }),
        }),
      );

      // Should publish conversation:updated event
      expect(kafkaProducer.publish).toHaveBeenCalledWith(
        'websocket.notifications',
        expect.objectContaining({
          key: mockUserId.toString(),
          value: expect.objectContaining({
            type: 'conversation:updated',
            userId: mockUserId.toString(),
          }),
        }),
      );
    });
  });

  describe('processWebhook - message types', () => {
    const createPayloadWithEvent = (eventName: string, messageContent: any) => ({
      event_name: eventName,
      app_id: 'app123',
      sender: { id: 'sender123' },
      recipient: { id: 'oa123456' },
      message: { msg_id: 'msg123', ...messageContent },
      timestamp: Date.now().toString(),
    });

    beforeEach(() => {
      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });
      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });
      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      messageModel.create.mockResolvedValue(mockMessage);
      platformConnectionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });
    });

    it('should handle user_send_text event', async () => {
      const payload = createPayloadWithEvent('user_send_text', { text: 'Hello' });

      await service.processWebhook(payload as ZaloWebhookDto);

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
        }),
      );
    });

    it('should handle user_send_image event', async () => {
      const payload = createPayloadWithEvent('user_send_image', {
        attachments: [{ payload: { url: 'https://example.com/image.jpg' } }],
      });

      await service.processWebhook(payload as ZaloWebhookDto);

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image',
        }),
      );
    });

    it('should handle user_send_file event', async () => {
      const payload = createPayloadWithEvent('user_send_file', {
        attachments: [{ payload: { url: 'https://example.com/doc.pdf' } }],
      });

      await service.processWebhook(payload as ZaloWebhookDto);

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file',
        }),
      );
    });

    it('should handle user_send_sticker event', async () => {
      const payload = createPayloadWithEvent('user_send_sticker', {
        attachments: [{ payload: { id: 'sticker123' } }],
      });

      await service.processWebhook(payload as ZaloWebhookDto);

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sticker',
        }),
      );
    });
  });

  describe('processWebhook - E11000 duplicate key handling', () => {
    it('should silently skip on E11000 duplicate key error', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: 'oa123456' },
        message: { text: 'Hello', msg_id: 'msg123' },
        timestamp: Date.now().toString(),
      };

      platformConnectionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPlatformConnection),
      });

      conversationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConversation),
      });

      // First check returns null (no existing message)
      messageModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // But create throws E11000 (race condition duplicate)
      const duplicateError = new Error('E11000 duplicate key error');
      (duplicateError as any).code = 11000;
      messageModel.create.mockRejectedValue(duplicateError);

      // Should not throw, just skip
      await expect(service.processWebhook(payload)).resolves.not.toThrow();

      // Kafka should NOT be called since message was duplicate
      expect(kafkaProducer.publish).not.toHaveBeenCalled();
    });
  });
});
