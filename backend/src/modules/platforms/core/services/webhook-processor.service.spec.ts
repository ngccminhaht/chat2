import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { WebhookProcessorService } from './webhook-processor.service';
import { PlatformRegistry } from './platform.registry';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import {
  Platform,
  MessageType,
  MessageDirection,
  ConversationStatus,
  MessageStatus,
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
import { IPlatformAdapter, MessageEvent, NormalizedMessage } from './../interfaces';

describe('WebhookProcessorService', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let service: WebhookProcessorService;
  let platformRegistry: PlatformRegistry;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let mockKafkaProducer: any;

  // Mock adapter
  const mockAdapter: Partial<IPlatformAdapter> = {
    platform: Platform.FACEBOOK,
    extractAccountId: jest.fn().mockReturnValue('page_123'),
    extractEvents: jest.fn().mockReturnValue([]),
    normalizeMessage: jest.fn(),
    fetchUserProfile: jest.fn().mockResolvedValue({
      id: 'user_456',
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
    }),
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
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
        PlatformRegistry,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
      ],
    }).compile();

    service = module.get<WebhookProcessorService>(WebhookProcessorService);
    platformRegistry = module.get<PlatformRegistry>(PlatformRegistry);
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    platformConnectionModel = module.get<Model<PlatformConnectionDocument>>(
      getModelToken(PlatformConnection.name),
    );

    // Register mock adapter
    platformRegistry.register(mockAdapter as IPlatformAdapter);
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clear collections after each test
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await platformConnectionModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should return error if platform connection not found', async () => {
      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Platform connection not found: facebook:page_123');
    });

    it('should process webhook successfully with no events', async () => {
      // Create platform connection
      await platformConnectionModel.create({
        userId: new Types.ObjectId(),
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([]);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process message events and create conversation + message', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
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
        messageId: 'm_123',
        messageType: MessageType.TEXT,
        content: { text: 'Hello' },
        rawPayload: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_123',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Hello' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(1);

      // Verify conversation was created
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(1);
      expect(conversations[0].platformConversationId).toBe('user_456_page_123');
      expect(conversations[0].customerPlatformUserId).toBe('user_456');
      expect(conversations[0].unreadCount).toBe(1);

      // Verify message was created
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].platformMessageId).toBe('m_123');
      expect(messages[0].content.text).toBe('Hello');

      // Verify Kafka notification was published
      expect(mockKafkaProducer.publish).toHaveBeenCalled();
    });

    it('should skip duplicate messages', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create existing conversation
      const conversation = await conversationModel.create({
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      // Create existing message (duplicate)
      await messageModel.create({
        conversationId: conversation._id,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'user_456', name: 'Test User' },
        status: MessageStatus.SENT,
      });

      const messageEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_123', // Same ID as existing
        messageType: MessageType.TEXT,
        content: { text: 'Hello' },
        rawPayload: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_123',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Hello' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0); // Should be skipped

      // Verify no new message was created
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1); // Still only 1 message
    });

    it('should skip echo messages (sender equals platformAccountId)', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Echo message: sender is the page itself
      const echoEvent: MessageEvent = {
        type: 'message',
        senderId: 'page_123', // Same as platformAccountId
        recipientId: 'user_456',
        timestamp: new Date(),
        messageId: 'm_123',
        messageType: MessageType.TEXT,
        content: { text: 'Echo' },
        rawPayload: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([echoEvent]);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0); // Echo should be skipped

      // Verify no conversation or message was created
      const conversations = await conversationModel.find({});
      const messages = await messageModel.find({});
      expect(conversations).toHaveLength(0);
      expect(messages).toHaveLength(0);
    });

    it('should skip comments from page itself', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Comment from page itself (page owner commenting on their own post)
      const pageCommentEvent: MessageEvent = {
        type: 'message',
        senderId: 'page_123', // Same as platformAccountId
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'comment_from_page',
        messageType: MessageType.TEXT,
        content: { text: 'Thanks for commenting!' },
        rawPayload: {
          isComment: true,
          post_id: 'post_789',
        },
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([pageCommentEvent]);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0); // Comment from page should be skipped

      // Verify no conversation or message was created
      const conversations = await conversationModel.find({});
      const messages = await messageModel.find({});
      expect(conversations).toHaveLength(0);
      expect(messages).toHaveLength(0);
    });

    it('should update existing conversation unread count', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create existing conversation
      await conversationModel.create({
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: ConversationStatus.OPEN,
        unreadCount: 5,
      });

      const messageEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'm_new',
        messageType: MessageType.TEXT,
        content: { text: 'New message' },
        rawPayload: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_new',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'New message' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      await service.process(Platform.FACEBOOK, {});

      // Verify unread count was incremented
      const conversation = await conversationModel.findOne({});
      expect(conversation.unreadCount).toBe(6);
    });

    it('should handle errors gracefully', async () => {
      (mockAdapter.extractAccountId as jest.Mock).mockImplementation(() => {
        throw new Error('Extract failed');
      });

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Webhook processing failed: Extract failed');

      // Restore mock
      (mockAdapter.extractAccountId as jest.Mock).mockReturnValue('page_123');
    });

    it('should handle E11000 duplicate key error gracefully (race condition)', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create existing conversation
      const conversation = await conversationModel.create({
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
        messageId: 'm_race_condition',
        messageType: MessageType.TEXT,
        content: { text: 'Race condition test' },
        rawPayload: {},
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([messageEvent]);

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'm_race_condition',
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Race condition test' },
        timestamp: new Date(),
        metadata: {},
      };

      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      // Simulate race condition: process same webhook twice concurrently
      const [result1, result2] = await Promise.all([
        service.process(Platform.FACEBOOK, {}),
        service.process(Platform.FACEBOOK, {}),
      ]);

      // Both should succeed (one processes, one skips)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Only ONE message should be created (unique index + E11000 handling)
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].platformMessageId).toBe('m_race_condition');
    });

    it('should handle multiple concurrent messages with different IDs', async () => {
      // Create platform connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create test messages with different IDs
      const createMessageEvent = (id: string): MessageEvent => ({
        type: 'message',
        senderId: 'user_456',
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: id,
        messageType: MessageType.TEXT,
        content: { text: `Message ${id}` },
        rawPayload: {},
      });

      const createNormalizedMessage = (id: string): NormalizedMessage => ({
        platformMessageId: id,
        conversationKey: 'user_456_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: `Message ${id}` },
        timestamp: new Date(),
        metadata: {},
      });

      // Process 3 different messages
      const messageIds = ['m_1', 'm_2', 'm_3'];

      for (const id of messageIds) {
        (mockAdapter.extractEvents as jest.Mock).mockReturnValue([createMessageEvent(id)]);
        (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(createNormalizedMessage(id));
        await service.process(Platform.FACEBOOK, {});
      }

      // All 3 messages should be created
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(3);
      expect(messages.map(m => m.platformMessageId).sort()).toEqual(['m_1', 'm_2', 'm_3']);
    });
  });
});
