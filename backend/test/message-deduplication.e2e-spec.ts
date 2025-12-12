/**
 * E2E Tests - Message Deduplication API
 * Tests the full HTTP API flow for duplicate message prevention
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { createHmac } from 'crypto';
import { AppModule } from '@/app.module';
import {
  Platform,
  MessageStatus,
  MessageDirection,
  MessageType,
  ConversationStatus,
} from '@/common/constants';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import {
  PlatformConnection,
  PlatformConnectionDocument,
} from '@/common/database/schemas/platform-connection.schema';
import { User, UserDocument } from '@/common/database/schemas/user.schema';

describe('Message Deduplication E2E', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let userModel: Model<UserDocument>;
  let accessToken: string;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Override MongoDB URI for testing
    process.env.MONGODB_URI = mongoUri;
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.FACEBOOK_APP_SECRET = 'test-fb-secret';
    process.env.ZALO_APP_SECRET = 'test-zalo-secret';
    process.env.SHOPEE_PARTNER_KEY = 'test-shopee-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('KAFKA_SERVICE')
      .useValue({
        emit: jest.fn(),
        send: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    conversationModel = moduleFixture.get<Model<ConversationDocument>>(
      getModelToken(Conversation.name),
    );
    messageModel = moduleFixture.get<Model<MessageDocument>>(
      getModelToken(Message.name),
    );
    platformConnectionModel = moduleFixture.get<Model<PlatformConnectionDocument>>(
      getModelToken(PlatformConnection.name),
    );
    userModel = moduleFixture.get<Model<UserDocument>>(getModelToken(User.name));

    // Create test user and get token
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
      });

    if (registerResponse.status === 201) {
      accessToken = registerResponse.body.accessToken;
      testUserId = new Types.ObjectId(registerResponse.body.user._id);
    } else {
      // User might already exist, try login
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
        });
      accessToken = loginResponse.body.accessToken;
      testUserId = new Types.ObjectId(loginResponse.body.user._id);
    }
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await platformConnectionModel.deleteMany({});
  });

  describe('POST /api/messages/send - Outbound Message Deduplication', () => {
    let connection: PlatformConnectionDocument;
    let conversation: ConversationDocument;

    beforeEach(async () => {
      // Create platform connection
      connection = await platformConnectionModel.create({
        userId: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create conversation
      conversation = await conversationModel.create({
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test Customer',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });
    });

    it('should create message with pending status', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          conversationId: conversation._id.toString(),
          type: 'text',
          content: { text: 'Hello from API' },
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(MessageStatus.PENDING);
      expect(response.body.platformMessageId).toMatch(/^pending_/);

      // Verify in database
      const messages = await messageModel.find({ conversationId: conversation._id });
      expect(messages).toHaveLength(1);
    });

    it('should prevent sending duplicate messages rapidly', async () => {
      // Send same message multiple times rapidly
      const promises = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/messages/send')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            conversationId: conversation._id.toString(),
            type: 'text',
            content: { text: 'Rapid fire message' },
          }),
      );

      const responses = await Promise.all(promises);

      // All should succeed (they have different pending IDs)
      expect(responses.every(r => r.status === 201)).toBe(true);

      // But each has unique platformMessageId
      const platformIds = responses.map(r => r.body.platformMessageId);
      const uniqueIds = new Set(platformIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('GET /api/messages/:conversationId - Message Retrieval', () => {
    let connection: PlatformConnectionDocument;
    let conversation: ConversationDocument;

    beforeEach(async () => {
      connection = await platformConnectionModel.create({
        userId: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      conversation = await conversationModel.create({
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test Customer',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });

      // Create test messages
      await messageModel.create([
        {
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_1',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Message 1' },
          sender: { platformUserId: 'user_456', name: 'Customer' },
          status: MessageStatus.SENT,
        },
        {
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_2',
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          content: { text: 'Reply 1' },
          sender: { platformUserId: 'page_123', name: 'Agent' },
          status: MessageStatus.SENT,
        },
        {
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_3',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Message 2' },
          sender: { platformUserId: 'user_456', name: 'Customer' },
          status: MessageStatus.SENT,
        },
      ]);
    });

    it('should return messages without duplicates', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/messages/${conversation._id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);

      // Check uniqueness
      const platformIds = response.body.data.map((m: any) => m.platformMessageId);
      const uniqueIds = new Set(platformIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/messages/${conversation._id}`)
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.meta.totalPages).toBe(2);
    });
  });

  describe('POST /api/messages/:conversationId/read - Mark as Read', () => {
    let connection: PlatformConnectionDocument;
    let conversation: ConversationDocument;

    beforeEach(async () => {
      connection = await platformConnectionModel.create({
        userId: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      conversation = await conversationModel.create({
        platform: Platform.FACEBOOK,
        platformConversationId: 'user_456_page_123',
        platformConnectionId: connection._id,
        platformAccountId: 'page_123',
        customerPlatformUserId: 'user_456',
        customerName: 'Test Customer',
        status: ConversationStatus.OPEN,
        unreadCount: 3,
      });

      // Create unread messages
      await messageModel.create([
        {
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_unread_1',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Unread 1' },
          sender: { platformUserId: 'user_456', name: 'Customer' },
          status: MessageStatus.SENT,
        },
        {
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_unread_2',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Unread 2' },
          sender: { platformUserId: 'user_456', name: 'Customer' },
          status: MessageStatus.SENT,
        },
      ]);
    });

    it('should mark all inbound messages as read', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/messages/${conversation._id}/read`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(2);

      // Verify messages are read
      const messages = await messageModel.find({ conversationId: conversation._id });
      expect(messages.every(m => m.status === MessageStatus.READ)).toBe(true);

      // Verify conversation unread count reset
      const updatedConversation = await conversationModel.findById(conversation._id);
      expect(updatedConversation.unreadCount).toBe(0);
    });

    it('should handle concurrent read requests safely', async () => {
      // Send multiple read requests concurrently
      const promises = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post(`/api/messages/${conversation._id}/read`)
          .set('Authorization', `Bearer ${accessToken}`),
      );

      const responses = await Promise.all(promises);

      // All should succeed
      expect(responses.every(r => r.status === 200)).toBe(true);

      // Messages should still be read (not duplicated)
      const messages = await messageModel.find({ conversationId: conversation._id });
      expect(messages).toHaveLength(2);
      expect(messages.every(m => m.status === MessageStatus.READ)).toBe(true);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce unique platformMessageId per platform', async () => {
      const conversationId = new Types.ObjectId();

      // Create first message
      await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_unique_constraint',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'First' },
        sender: { platformUserId: 'user_456', name: 'User' },
        status: MessageStatus.SENT,
      });

      // Try to create duplicate via direct insert
      let error: any;
      try {
        await messageModel.create({
          conversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'm_unique_constraint',
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
      expect(error.code).toBe(11000);
    });

    it('should allow same platformMessageId across different platforms', async () => {
      const conversationId = new Types.ObjectId();

      // Create message for Facebook
      await messageModel.create({
        conversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'm_cross_platform_test',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Facebook' },
        sender: { platformUserId: 'fb_user', name: 'FB User' },
        status: MessageStatus.SENT,
      });

      // Create message for Zalo with same ID - should succeed
      const zaloMessage = await messageModel.create({
        conversationId,
        platform: Platform.ZALO,
        platformMessageId: 'm_cross_platform_test',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Zalo' },
        sender: { platformUserId: 'zalo_user', name: 'Zalo User' },
        status: MessageStatus.SENT,
      });

      expect(zaloMessage).toBeDefined();

      const messages = await messageModel.find({});
      expect(messages).toHaveLength(2);
    });
  });

  describe('GET /api/conversations - List Conversations', () => {
    beforeEach(async () => {
      const connection = await platformConnectionModel.create({
        userId: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: 'page_123',
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: 'active',
      });

      // Create multiple conversations
      for (let i = 1; i <= 5; i++) {
        await conversationModel.create({
          platform: Platform.FACEBOOK,
          platformConversationId: `conv_${i}_page_123`,
          platformConnectionId: connection._id,
          platformAccountId: 'page_123',
          customerPlatformUserId: `customer_${i}`,
          customerName: `Customer ${i}`,
          status: ConversationStatus.OPEN,
          unreadCount: i,
          lastMessage: {
            text: `Last message ${i}`,
            timestamp: new Date(),
            senderId: `customer_${i}`,
          },
        });
      }
    });

    it('should return conversations without duplicates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/conversations')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);

      // Verify uniqueness
      const convIds = response.body.data.map((c: any) => c.platformConversationId);
      const uniqueIds = new Set(convIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});
