import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { WebhookProcessorService } from './webhook-processor.service';
import { PlatformRegistry } from './platform.registry';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { InboundMessageHandlerService } from '@/modules/messages/inbound-message-handler.service';
import {
  Platform,
  MessageType,
  MessageDirection,
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

// Mock axios to prevent actual HTTP calls
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
}));

describe('WebhookProcessorService', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let service: WebhookProcessorService;
  let platformRegistry: PlatformRegistry;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let mockKafkaProducer: any;
  let mockInboundMessageHandler: any;

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

    mockInboundMessageHandler = {
      processInboundMessage: jest.fn(),
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
        { provide: InboundMessageHandlerService, useValue: mockInboundMessageHandler },
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
        organizationId: new Types.ObjectId(),
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

    it('should process message events and call InboundMessageHandlerService', async () => {
      // Create platform connection
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        organizationId,
        userId: new Types.ObjectId(),
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create conversation in DB (needed for publishNotification to findById)
      const conversation = await conversationModel.create({
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: 'open',
        unreadCount: 0,
      });

      // Mock InboundMessageHandlerService to return the real conversation
      mockInboundMessageHandler.processInboundMessage.mockResolvedValueOnce({
        message: {
          _id: new Types.ObjectId(),
          conversationId: conversation._id,
          platformMessageId: 'm_123',
          platform: Platform.FACEBOOK,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Hello' },
          sender: { platformUserId: 'user_456', name: 'Test User' },
          status: 'sent',
        },
        conversation: conversation,
        isNew: true,
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

      // Verify InboundMessageHandlerService was called
      expect(mockInboundMessageHandler.processInboundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.FACEBOOK,
          organizationId: organizationId.toString(),
          conversationKey: 'user_456_page_123',
          platformMessageId: 'm_123',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Hello' },
        }),
      );

      // Verify Kafka notification was published
      expect(mockKafkaProducer.publish).toHaveBeenCalled();
    });

    it('should skip duplicate messages (isNew = false)', async () => {
      // Create platform connection
      const organizationId = new Types.ObjectId();
      await platformConnectionModel.create({
        organizationId,
        userId: new Types.ObjectId(),
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

      // Mock InboundMessageHandlerService to return isNew: false (duplicate)
      mockInboundMessageHandler.processInboundMessage.mockResolvedValueOnce({
        message: null,
        conversation: { _id: new Types.ObjectId() },
        isNew: false,
      });

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0); // Should be skipped

      // Kafka should NOT be called for duplicates
      expect(mockKafkaProducer.publish).not.toHaveBeenCalled();
    });

    it('should skip echo messages (sender equals platformAccountId)', async () => {
      // Create platform connection
      await platformConnectionModel.create({
        organizationId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
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

      // InboundMessageHandlerService should NOT be called for echo messages
      expect(mockInboundMessageHandler.processInboundMessage).not.toHaveBeenCalled();
    });

    it('should skip comments from page itself (processor layer check)', async () => {
      // This tests the processor's skip logic as a safety layer
      // Primary skip happens in FacebookAdapter.parseCommentEvent(), but processor
      // has a secondary check in case adapter passes through page's own messages
      await platformConnectionModel.create({
        organizationId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Simulate: adapter returns an event where senderId === pageId
      // (this tests the processor's safety layer, not the adapter's skip)
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
          post_id: 'page_123_post_789',
          postId: 'page_123_post_789',
        },
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([pageCommentEvent]);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0); // Processor should skip senderId === pageId

      // InboundMessageHandlerService should NOT be called
      expect(mockInboundMessageHandler.processInboundMessage).not.toHaveBeenCalled();
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

    it('should process comment events with isComment metadata', async () => {
      // Create platform connection
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        organizationId,
        userId: new Types.ObjectId(),
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create conversation for comment (now uses unified key: senderId_pageId)
      const conversation = await conversationModel.create({
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123', // Unified key for both inbox and comments
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: 'open',
        unreadCount: 0,
      });

      // Mock InboundMessageHandlerService
      mockInboundMessageHandler.processInboundMessage.mockResolvedValueOnce({
        message: {
          _id: new Types.ObjectId(),
          conversationId: conversation._id,
          platformMessageId: 'comment_abc',
          platform: Platform.FACEBOOK,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Nice post!' },
          sender: { platformUserId: 'user_456', name: 'Test User' },
          status: 'sent',
        },
        conversation: conversation,
        isNew: true,
      });

      // Comment from a customer (not the page)
      const commentEvent: MessageEvent = {
        type: 'message',
        senderId: 'user_456', // Customer, not page
        recipientId: 'page_123',
        timestamp: new Date(),
        messageId: 'comment_abc',
        messageType: MessageType.TEXT,
        content: { text: 'Nice post!' },
        rawPayload: {
          isComment: true,
          post_id: 'page_123_post_789',
          sender_name: 'Test User',
        },
      };

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue([commentEvent]);

      const normalizedMessage: NormalizedMessage = {
        platformMessageId: 'comment_abc',
        conversationKey: 'post_page_123_post_789_page_123',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        senderId: 'user_456',
        recipientId: 'page_123',
        content: { text: 'Nice post!' },
        timestamp: new Date(),
        metadata: {
          isComment: true,
          rawPayload: {
            isComment: true,
            post_id: 'page_123_post_789',
          },
        },
      };

      (mockAdapter.normalizeMessage as jest.Mock).mockReturnValue(normalizedMessage);

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(1);

      // Verify InboundMessageHandlerService was called with isComment metadata
      expect(mockInboundMessageHandler.processInboundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.FACEBOOK,
          metadata: expect.objectContaining({
            isComment: true,
          }),
        }),
      );
    });

    it('should process multiple events in a single webhook', async () => {
      // Create platform connection
      const organizationId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        organizationId,
        userId: new Types.ObjectId(),
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create conversation
      const conversation = await conversationModel.create({
        organizationId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test User',
        status: 'open',
        unreadCount: 0,
      });

      // Mock InboundMessageHandlerService for both messages
      mockInboundMessageHandler.processInboundMessage
        .mockResolvedValueOnce({
          message: {
            _id: new Types.ObjectId(),
            conversationId: conversation._id,
            platformMessageId: 'm_1',
            platform: Platform.FACEBOOK,
            direction: MessageDirection.INBOUND,
            type: MessageType.TEXT,
            content: { text: 'Message 1' },
            sender: { platformUserId: 'user_456', name: 'Test User' },
            status: 'sent',
          },
          conversation: conversation,
          isNew: true,
        })
        .mockResolvedValueOnce({
          message: {
            _id: new Types.ObjectId(),
            conversationId: conversation._id,
            platformMessageId: 'm_2',
            platform: Platform.FACEBOOK,
            direction: MessageDirection.INBOUND,
            type: MessageType.TEXT,
            content: { text: 'Message 2' },
            sender: { platformUserId: 'user_456', name: 'Test User' },
            status: 'sent',
          },
          conversation: conversation,
          isNew: true,
        });

      const events: MessageEvent[] = [
        {
          type: 'message',
          senderId: 'user_456',
          recipientId: 'page_123',
          timestamp: new Date(),
          messageId: 'm_1',
          messageType: MessageType.TEXT,
          content: { text: 'Message 1' },
          rawPayload: {},
        },
        {
          type: 'message',
          senderId: 'user_456',
          recipientId: 'page_123',
          timestamp: new Date(),
          messageId: 'm_2',
          messageType: MessageType.TEXT,
          content: { text: 'Message 2' },
          rawPayload: {},
        },
      ];

      (mockAdapter.extractEvents as jest.Mock).mockReturnValue(events);

      (mockAdapter.normalizeMessage as jest.Mock)
        .mockReturnValueOnce({
          platformMessageId: 'm_1',
          conversationKey: 'user_456_page_123',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          senderId: 'user_456',
          recipientId: 'page_123',
          content: { text: 'Message 1' },
          timestamp: new Date(),
          metadata: {},
        })
        .mockReturnValueOnce({
          platformMessageId: 'm_2',
          conversationKey: 'user_456_page_123',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          senderId: 'user_456',
          recipientId: 'page_123',
          content: { text: 'Message 2' },
          timestamp: new Date(),
          metadata: {},
        });

      const result = await service.process(Platform.FACEBOOK, {});

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(2);
      expect(mockInboundMessageHandler.processInboundMessage).toHaveBeenCalledTimes(2);
    });
  });
});
