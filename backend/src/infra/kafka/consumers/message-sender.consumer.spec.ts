import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { MessageSenderConsumer } from './message-sender.consumer';
import { PlatformRegistry } from '@/modules/platforms/core/services/platform.registry';
import { KafkaProducerService } from '../kafka-producer.service';
import {
  Platform,
  MessageStatus,
  MessageDirection,
  MessageType,
} from '@/common/constants';
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
import { OutgoingMessageEvent } from '../types/webhook.types';

describe('MessageSenderConsumer', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let consumer: MessageSenderConsumer;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let mockKafkaProducer: any;
  let mockPlatformRegistry: any;
  let mockAdapter: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    mockAdapter = {
      platform: Platform.FACEBOOK,
      formatOutbound: jest.fn().mockReturnValue({ text: 'formatted' }),
      send: jest.fn().mockResolvedValue({
        success: true,
        platformMessageId: 'm_real_facebook_id',
      }),
    };

    mockPlatformRegistry = {
      get: jest.fn().mockReturnValue(mockAdapter),
    };

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: Message.name, schema: MessageSchema },
          { name: PlatformConnection.name, schema: PlatformConnectionSchema },
        ]),
      ],
      providers: [
        MessageSenderConsumer,
        { provide: PlatformRegistry, useValue: mockPlatformRegistry },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
      ],
    }).compile();

    consumer = module.get<MessageSenderConsumer>(MessageSenderConsumer);
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
    await messageModel.deleteMany({});
    await platformConnectionModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('handleOutgoingMessage', () => {
    it('should send message and update platformMessageId', async () => {
      // Create connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create pending message
      const conversationId = new Types.ObjectId();
      const pendingMessage = await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_abc123`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await consumer.handleOutgoingMessage(event);

      // Verify message was updated
      const updatedMessage = await messageModel.findById(pendingMessage._id);
      expect(updatedMessage.status).toBe(MessageStatus.SENT);
      expect(updatedMessage.platformMessageId).toBe('m_real_facebook_id');
    });

    it('should handle race condition: delete pending message if webhook already created real message', async () => {
      // Create connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const conversationId = new Types.ObjectId();

      // Create pending message (created when user sent from web)
      const pendingMessage = await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_abc123`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      // Simulate: webhook already created message with real ID (race condition)
      const realMessage = await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_real_facebook_id', // Real ID from platform
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.SENT,
      });

      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await consumer.handleOutgoingMessage(event);

      // Verify: pending message should be deleted
      const deletedPending = await messageModel.findById(pendingMessage._id);
      expect(deletedPending).toBeNull();

      // Verify: real message still exists
      const existingReal = await messageModel.findById(realMessage._id);
      expect(existingReal).not.toBeNull();
      expect(existingReal.platformMessageId).toBe('m_real_facebook_id');

      // Only one message should exist
      const allMessages = await messageModel.find({});
      expect(allMessages).toHaveLength(1);
    });

    it('should mark message as failed when connection not found', async () => {
      const conversationId = new Types.ObjectId();
      const pendingMessage = await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_abc123`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: new Types.ObjectId().toString(), // Non-existent
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await consumer.handleOutgoingMessage(event);

      // Verify message was marked as failed
      const updatedMessage = await messageModel.findById(pendingMessage._id);
      expect(updatedMessage.status).toBe(MessageStatus.FAILED);
    });

    it('should mark message as failed when platform send fails', async () => {
      // Create connection
      const userId = new Types.ObjectId();
      const connection = await platformConnectionModel.create({
        userId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      const conversationId = new Types.ObjectId();
      const pendingMessage = await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: `pending_${Date.now()}_abc123`,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        sender: { platformUserId: 'page_123', name: 'Agent' },
        status: MessageStatus.PENDING,
      });

      // Mock send failure
      mockAdapter.send.mockResolvedValueOnce({
        success: false,
        error: 'Rate limit exceeded',
      });

      const event: OutgoingMessageEvent = {
        messageId: pendingMessage._id.toString(),
        conversationId: conversationId.toString(),
        platform: Platform.FACEBOOK,
        platformConnectionId: connection._id.toString(),
        platformAccountId: 'page_123',
        recipientId: 'user_456',
        message: {
          type: MessageType.TEXT,
          text: 'Hello',
        },
        credentials: { accessToken: 'test_token' },
        timestamp: Date.now(),
      };

      await consumer.handleOutgoingMessage(event);

      // Verify message was marked as failed
      const updatedMessage = await messageModel.findById(pendingMessage._id);
      expect(updatedMessage.status).toBe(MessageStatus.FAILED);
    });
  });
});
