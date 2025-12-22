/**
 * Integration Tests - Message Deduplication
 * Tests the full flow of duplicate message prevention across services
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  Platform,
  MessageStatus,
  MessageDirection,
  MessageType,
  ConversationStatus,
} from '@/common/constants';
import {
  Conversation,
  ConversationSchema,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageSchema,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionSchema,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { WebhookProcessorService } from '@/modules/platforms/core/services/webhook-processor.service';
import { PlatformRegistry } from '@/modules/platforms/core/services/platform.registry';
import { MessageSenderConsumer } from '@/infra/kafka/consumers/message-sender.consumer';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { EnvService } from '@/common/env';
import { VisitorGateway } from '@/modules/websocket/visitor.gateway';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';
import { IPlatformAdapter, MessageEvent, NormalizedMessage } from '@/modules/platforms/core/interfaces';
import { OutgoingMessageEvent } from '@/infra/kafka/types/webhook.types';
import { AIBatchingService } from '@/modules/ai-batching/ai-batching.service';

describe('Message Deduplication Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let webhookProcessor: WebhookProcessorService;
  let messageSender: MessageSenderConsumer;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let mockKafkaProducer: any;
  let mockAdapter: Partial<IPlatformAdapter>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    mockAdapter = {
      platform: Platform.FACEBOOK,
      extractAccountId: jest.fn().mockReturnValue('page_123'),
      extractEvents: jest.fn().mockReturnValue([]),
      normalizeMessage: jest.fn(),
      fetchUserProfile: jest.fn().mockResolvedValue({
        id: 'user_456',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
      }),
      formatOutbound: jest.fn().mockReturnValue({ text: 'formatted' }),
      send: jest.fn().mockResolvedValue({
        success: true,
        platformMessageId: 'm_real_platform_id',
      }),
    };

    const mockPlatformRegistry = {
      get: jest.fn().mockReturnValue(mockAdapter),
      register: jest.fn(),
    };

    const mockVisitorGateway = {
      emitToVisitor: jest.fn(),
    };

    const mockWebsocketGateway = {
      emitToOrgAgents: jest.fn(),
    };

    const mockAIBatchingService = {
      onVisitorMessage: jest.fn().mockResolvedValue(undefined),
      cancelBatch: jest.fn().mockResolvedValue(false),
      updateAIState: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const envVars: Record<string, any> = {
          ZALO_APP_ID: 'test_app_id',
          ZALO_APP_SECRET: 'test_app_secret',
        };
        return envVars[key];
      }),
    };

    const mockEnvService = {
      get: jest.fn((key: string) => {
        const envVars: Record<string, any> = {
          ZALO_APP_ID: 'test_app_id',
          ZALO_APP_SECRET: 'test_app_secret',
        };
        return envVars[key];
      }),
    };

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: PlatformConnection.name, schema: PlatformConnectionSchema },
        ]),
      ],
      providers: [
        WebhookProcessorService,
        MessageSenderConsumer,
        { provide: PlatformRegistry, useValue: mockPlatformRegistry },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: EnvService, useValue: mockEnvService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: VisitorGateway, useValue: mockVisitorGateway },
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
        { provide: AIBatchingService, useValue: mockAIBatchingService },
      ],
    }).compile();

    webhookProcessor = module.get<WebhookProcessorService>(WebhookProcessorService);
    messageSender = module.get<MessageSenderConsumer>(MessageSenderConsumer);
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    platformConnectionModel = module.get<Model<PlatformConnectionDocument>>(
      getModelToken(PlatformConnection.name),
    );
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await platformConnectionModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Inbound Message Deduplication', () => {
    it('should prevent duplicate when same webhook is processed multiple times', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const messageEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_duplicate_test',
        messageType: MessageType.TEXT,
        content: { text: 'Hello' },
        rawPayload: {},
      };

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_duplicate_test',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Hello' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);
      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      // Process same webhook 5 times sequentially
      for (let i = 0; i < 5; i++) {
        await webhookProcessor.process(Platform.FACEBOOK, {});
      }

      // Verify only 1 message exists
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].platformMessageId).toBe('m_duplicate_test');
    });

    it('should prevent duplicate when webhook is processed concurrently (race condition)', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Pre-create conversation to speed up test
      await conversationModel.create({
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      const messageEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_race_test',
        messageType: MessageType.TEXT,
        content: { text: 'Race condition test' },
        rawPayload: {},
      };

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_race_test',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Race condition test' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);
      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      // Process same webhook 10 times concurrently
      const promises = Array(10).fill(null).map(() =>
        webhookProcessor.process(Platform.FACEBOOK, {}),
      );
      const results = await Promise.all(promises);

      // All should succeed (no errors thrown)
      expect(results.every(r => r.success)).toBe(true);

      // Only 1 message should exist
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].platformMessageId).toBe('m_race_test');
    });

    it('should handle multiple different messages correctly', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Process 5 different messages
      for (let i = 1; i <= 5; i++) {
        const messageEvent: MessageEvent = {
          type: 'message',
          senderId: 'user_456',
          recipientId: 'page_123',
          timestamp: new Date(),
          messageId: `m_msg_${i}`,
          messageType: MessageType.TEXT,
          content: { text: `Message ${i}` },
          rawPayload: {},
        };

        const normalizedMessage: NormalizedMessage = {
          platformMessageId: `m_msg_${i}`,
          conversationKey: 'user_456_page_123',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          senderId: 'user_456',
          recipientId: 'page_123',
          content: { text: `Message ${i}` },
          timestamp: new Date(),
          metadata: {},
        };

        (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);
        (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

        await webhookProcessor.process(Platform.FACEBOOK, {});
      }

      // All 5 messages should exist
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(5);
      expect(messages.map(m => m.platformMessageId).sort()).toEqual([
        'm_msg_1', 'm_msg_2', 'm_msg_3', 'm_msg_4', 'm_msg_5',
      ]);
    });
  });

  describe('Outbound Message Race Condition', () => {
    it('should delete pending message when webhook already created real message', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const conversationId = new Types.ObjectId();
      await conversationModel.create({
        _id: conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      // 1. Create pending message (simulating user sending from web)
      const pendingMessage = await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_abc123`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello from web' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      // 2. Simulate webhook creating message with real ID (echo from platform)
      const webhookMessage = await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_real_platform_id', // Real ID from Facebook
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello from web' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.SENT,
      });

      // 3. Consumer tries to update pending message with real ID
      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello from web',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await messageSender.handleOutgoingMessage(event);

      // Verify: pending message should be deleted
      const pendingExists = await messageModel.findById(pendingMessage._id);
      expect(pendingExists).toBeNull();

      // Verify: webhook message still exists
      const webhookExists = await messageModel.findById(webhookMessage._id);
      expect(webhookExists).not.toBeNull();

      // Verify: only 1 message exists
      const allMessages = await messageModel.find({ conversationId });
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].platformMessageId).toBe('m_real_platform_id');
    });

    it('should update pending message when no race condition occurs', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const conversationId = new Types.ObjectId();
      await conversationModel.create({
        _id: conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      // Create pending message
      const pendingMessage = await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_xyz789`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Normal send' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      // No webhook message exists - normal case

      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Normal send',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await messageSender.handleOutgoingMessage(event);

      // Verify: message should be updated with real ID
      const updatedMessage = await messageModel.findById(pendingMessage._id);
      expect(updatedMessage).not.toBeNull();
      expect(updatedMessage.platformMessageId).toBe('m_real_platform_id');
      expect(updatedMessage.status).toBe(MessageStatus.SENT);
    });
  });

  describe('Mixed Scenario: Web + Platform Messages', () => {
    it('should handle interleaved web and platform messages correctly', async () => {
      // Setup
      const userId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const conversationId = new Types.ObjectId();
      await conversationModel.create({
        _id: conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      // 1. Inbound message from platform
      const inboundEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_inbound_1',
        messageType: MessageType.TEXT,
        content: { text: 'Hi there' },
        rawPayload: {},
      };

      const normalizedInbound: NormalizedMessage = {
        platformMessageId: 'm_inbound_1',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Hi there' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([inboundEvent]);
      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedInbound);

      await webhookProcessor.process(Platform.FACEBOOK, {});

      // 2. Outbound message from web
      const pendingMessage = await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_reply`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello!' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      const outboundEvent: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello!',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await messageSender.handleOutgoingMessage(outboundEvent);

      // 3. Another inbound message
      const inboundEvent2: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_inbound_2',
        messageType: MessageType.TEXT,
        content: { text: 'Thanks!' },
        rawPayload: {},
      };

      const normalizedInbound2: NormalizedMessage = {
        platformMessageId: 'm_inbound_2',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Thanks!' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([inboundEvent2]);
      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedInbound2);

      await webhookProcessor.process(Platform.FACEBOOK, {});

      // Verify: 3 unique messages
      const messages = await messageModel.find({ conversationId }).sort({ createdAt: 1 });
      expect(messages).toHaveLength(3);

      // Check message order and content
      expect(messages[0].platformMessageId).toBe('m_inbound_1');
      expect(messages[0].direction).toBe(MessageDirection.INBOUND);

      expect(messages[1].platformMessageId).toBe('m_real_platform_id');
      expect(messages[1].direction).toBe(MessageDirection.OUTBOUND);
      expect(messages[1].status).toBe(MessageStatus.SENT);

      expect(messages[2].platformMessageId).toBe('m_inbound_2');
      expect(messages[2].direction).toBe(MessageDirection.INBOUND);
    });
  });

  describe('Database Unique Index Enforcement', () => {
    it('should enforce unique constraint at database level', async () => {
      const conversationId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();

      // Create first message
      await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_unique_test',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'First' },
        sender: { platformUserId: 'user_456', name: 'User' },
        status: MessageStatus.SENT,
      });

      // Try to create duplicate - should throw E11000
      let error: any;
      try {
        await messageModel.create({
          conversationId,
          organizationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_unique_test', // Same ID
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Duplicate' },
          sender: { platformUserId: 'user_456', name: 'User' },
          status: MessageStatus.SENT,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000); // MongoDB duplicate key error

      // Only 1 message should exist
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
    });

    it('should allow same platformMessageId for different platforms', async () => {
      const conversationId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();

      // Create message for Facebook
      await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_cross_platform',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Facebook message' },
        sender: { platformUserId: 'user_456', name: 'User' },
        status: MessageStatus.SENT,
      });

      // Create message for Zalo with same platformMessageId - should succeed
      await messageModel.create({
        conversationId,
        organizationId,
        platform: Platform.ZALO,
        platformMessageId: 'm_cross_platform', // Same ID, different platform
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Zalo message' },
        sender: { platformUserId: 'user_789', name: 'User' },
        status: MessageStatus.SENT,
      });

      // Both messages should exist
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(2);
    });
  });
});
