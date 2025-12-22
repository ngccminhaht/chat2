/**
 * E2E Tests - Webhook & Messaging Flow
 * Tests full HTTP API flow for webhooks, message sending/receiving, and real-time notifications
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { createHmac } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import {
  Platform,
  MessageStatus,
  MessageDirection,
  MessageType,
  ConversationStatus,
  ConnectionStatus,
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
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { User, UserDocument } from '@/common/database/schemas/user.schema';

describe('Webhook & Messaging Flow E2E', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let organizationModel: Model<OrganizationDocument>;
  let userModel: Model<UserDocument>;

  // Auth tokens
  let accessToken: string;
  let testUserId: Types.ObjectId;
  let testOrgId: Types.ObjectId;

  // Test constants
  const ZALO_OA_ID = 'oa_test_123456';
  const FB_PAGE_ID = 'page_test_789';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Set environment variables
    process.env.MONGODB_URI = mongoUri;
    process.env.JWT_SECRET = 'test-jwt-secret-for-e2e';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-e2e';
    process.env.FACEBOOK_APP_SECRET = 'test-fb-app-secret';
    process.env.FACEBOOK_VERIFY_TOKEN = 'test-fb-verify-token';
    process.env.ZALO_APP_SECRET = 'test-zalo-app-secret';
    process.env.ZALO_APP_ID = 'test-zalo-app-id';

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
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0); // Random port for testing

    // Get models
    conversationModel = moduleFixture.get<Model<ConversationDocument>>(
      getModelToken(Conversation.name),
    );
    messageModel = moduleFixture.get<Model<MessageDocument>>(
      getModelToken(Message.name),
    );
    platformConnectionModel = moduleFixture.get<Model<PlatformConnectionDocument>>(
      getModelToken(PlatformConnection.name),
    );
    organizationModel = moduleFixture.get<Model<OrganizationDocument>>(
      getModelToken(Organization.name),
    );
    userModel = moduleFixture.get<Model<UserDocument>>(getModelToken(User.name));

    // Create test user
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test-webhook@example.com',
        password: 'Test123!@#',
        name: 'Test Webhook User',
      });

    if (registerResponse.status === 201) {
      accessToken = registerResponse.body.accessToken;
      testUserId = new Types.ObjectId(registerResponse.body.user._id);
    }

    // Create test organization
    testOrgId = new Types.ObjectId();
    await organizationModel.create({
      _id: testOrgId,
      name: 'Test Org',
      slug: 'test-org',
      owner: testUserId,
      isActive: true,
    });
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

  describe('Zalo Webhook Flow', () => {
    let zaloConnection: PlatformConnectionDocument;

    beforeEach(async () => {
      // Create Zalo platform connection
      zaloConnection = await platformConnectionModel.create({
        organizationId: testOrgId,
        connectedBy: testUserId,
        platform: Platform.ZALO,
        platformAccountId: ZALO_OA_ID,
        platformAccountName: 'Test Zalo OA',
        credentials: {
          accessToken: 'test-zalo-access-token',
          refreshToken: 'test-zalo-refresh-token',
        },
        status: ConnectionStatus.ACTIVE,
      });
    });

    it('POST /api/zalo/webhook - should receive and process text message', async () => {
      const payload = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_001' },
        recipient: { id: ZALO_OA_ID },
        message: { text: 'Hello from Zalo!', msg_id: 'zalo_msg_001' },
        timestamp: Date.now().toString(),
      };

      const response = await request(app.getHttpServer())
        .post('/api/zalo/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/zalo/webhook - should handle image message', async () => {
      const payload = {
        event_name: 'user_send_image',
        app_id: 'app123',
        sender: { id: 'zalo_user_002' },
        recipient: { id: ZALO_OA_ID },
        message: {
          msg_id: 'zalo_img_001',
          attachments: [
            { type: 'image', payload: { url: 'https://example.com/image.jpg' } },
          ],
        },
        timestamp: Date.now().toString(),
      };

      const response = await request(app.getHttpServer())
        .post('/api/zalo/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/zalo/webhook - should handle file message', async () => {
      const payload = {
        event_name: 'user_send_file',
        app_id: 'app123',
        sender: { id: 'zalo_user_003' },
        recipient: { id: ZALO_OA_ID },
        message: {
          msg_id: 'zalo_file_001',
          attachments: [
            { type: 'file', payload: { url: 'https://example.com/doc.pdf' } },
          ],
        },
        timestamp: Date.now().toString(),
      };

      const response = await request(app.getHttpServer())
        .post('/api/zalo/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/zalo/webhook - should handle sticker message', async () => {
      const payload = {
        event_name: 'user_send_sticker',
        app_id: 'app123',
        sender: { id: 'zalo_user_004' },
        recipient: { id: ZALO_OA_ID },
        message: {
          msg_id: 'zalo_sticker_001',
          attachments: [{ type: 'sticker', payload: { id: 'sticker_123' } }],
        },
        timestamp: Date.now().toString(),
      };

      const response = await request(app.getHttpServer())
        .post('/api/zalo/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/zalo/webhook - should respond quickly for concurrent requests', async () => {
      const payload = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_concurrent_user' },
        recipient: { id: ZALO_OA_ID },
        message: { text: 'Concurrent test', msg_id: 'concurrent_msg' },
        timestamp: Date.now().toString(),
      };

      const startTime = Date.now();
      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          request(app.getHttpServer())
            .post('/api/zalo/webhook')
            .send({ ...payload, message: { ...payload.message, msg_id: `concurrent_${i}` } }),
        );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      expect(responses.every((r) => r.status === 200)).toBe(true);
      // Should complete within reasonable time (< 5s for 10 requests)
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Facebook Webhook Flow', () => {
    let fbConnection: PlatformConnectionDocument;

    beforeEach(async () => {
      fbConnection = await platformConnectionModel.create({
        organizationId: testOrgId,
        connectedBy: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: FB_PAGE_ID,
        platformAccountName: 'Test Facebook Page',
        credentials: {
          accessToken: 'test-fb-page-token',
        },
        status: ConnectionStatus.ACTIVE,
      });
    });

    it('GET /api/facebook/webhook - should verify webhook subscription', async () => {
      const challenge = 'test_challenge_string_123';

      const response = await request(app.getHttpServer())
        .get('/api/facebook/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.challenge': challenge,
          'hub.verify_token': 'test-fb-verify-token',
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe(challenge);
    });

    it('GET /api/facebook/webhook - should reject invalid verify token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/facebook/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.challenge': 'test_challenge',
          'hub.verify_token': 'wrong_token',
        });

      expect(response.status).toBe(400);
    });

    it('POST /api/facebook/webhook - should receive message event', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: FB_PAGE_ID,
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_001' },
                recipient: { id: FB_PAGE_ID },
                timestamp: Date.now(),
                message: {
                  mid: 'fb_msg_001',
                  text: 'Hello from Facebook!',
                },
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/facebook/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/facebook/webhook - should handle message with attachments', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: FB_PAGE_ID,
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_002' },
                recipient: { id: FB_PAGE_ID },
                timestamp: Date.now(),
                message: {
                  mid: 'fb_img_001',
                  attachments: [
                    {
                      type: 'image',
                      payload: { url: 'https://example.com/fb-image.jpg' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/facebook/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/facebook/webhook - should handle postback event', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: FB_PAGE_ID,
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_003' },
                recipient: { id: FB_PAGE_ID },
                timestamp: Date.now(),
                postback: {
                  title: 'Get Started',
                  payload: 'GET_STARTED',
                },
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/facebook/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/facebook/webhook - should handle read receipt', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: FB_PAGE_ID,
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_004' },
                recipient: { id: FB_PAGE_ID },
                timestamp: Date.now(),
                read: {
                  watermark: Date.now(),
                },
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/facebook/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/facebook/webhook - should handle delivery confirmation', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: FB_PAGE_ID,
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_005' },
                recipient: { id: FB_PAGE_ID },
                timestamp: Date.now(),
                delivery: {
                  mids: ['mid_001', 'mid_002'],
                  watermark: Date.now(),
                },
              },
            ],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/facebook/webhook')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Message Send API', () => {
    let conversation: ConversationDocument;
    let connection: PlatformConnectionDocument;

    beforeEach(async () => {
      connection = await platformConnectionModel.create({
        organizationId: testOrgId,
        connectedBy: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: FB_PAGE_ID,
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: ConnectionStatus.ACTIVE,
      });

      conversation = await conversationModel.create({
        organizationId: testOrgId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'fb_user_test_page_123',
        platformConnectionId: connection._id,
        platformAccountId: FB_PAGE_ID,
        customerPlatformUserId: 'fb_user_test',
        customerName: 'Test Customer',
        status: ConversationStatus.OPEN,
        unreadCount: 0,
      });
    });

    it('POST /api/organizations/:orgId/messages/send - should create pending message', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/organizations/${testOrgId}/messages/send`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          conversationId: conversation._id.toString(),
          type: 'text',
          text: 'Hello from agent!',
        });

      expect(response.status).toBe(201);
      expect(response.body.direction).toBe(MessageDirection.OUTBOUND);

      // Verify message in DB
      const messages = await messageModel.find({ conversationId: conversation._id });
      expect(messages).toHaveLength(1);
    });

    it('POST /api/organizations/:orgId/messages/send - should require authentication', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/organizations/${testOrgId}/messages/send`)
        .send({
          conversationId: conversation._id.toString(),
          type: 'text',
          text: 'No auth',
        });

      expect(response.status).toBe(401);
    });

    it('GET /api/organizations/:orgId/messages/conversation/:conversationId - should return messages', async () => {
      // Create some messages
      await messageModel.create([
        {
          organizationId: testOrgId,
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_1',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Hello' },
          sender: { platformUserId: 'fb_user', name: 'Customer' },
          status: MessageStatus.DELIVERED,
        },
        {
          organizationId: testOrgId,
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_2',
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          content: { text: 'Hi there!' },
          sender: { platformUserId: 'agent_1', name: 'Agent' },
          status: MessageStatus.SENT,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/messages/conversation/${conversation._id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('PATCH /api/organizations/:orgId/messages/mark-read - should mark messages as read', async () => {
      // Create unread messages
      await messageModel.create([
        {
          organizationId: testOrgId,
          conversationId: conversation._id,
          platform: Platform.FACEBOOK,
          platformMessageId: 'unread_1',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Unread message' },
          sender: { platformUserId: 'fb_user', name: 'Customer' },
          status: MessageStatus.DELIVERED,
        },
      ]);

      // Update conversation unread count
      await conversationModel.updateOne(
        { _id: conversation._id },
        { unreadCount: 1 },
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/organizations/${testOrgId}/messages/mark-read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          conversationId: conversation._id.toString(),
        });

      expect(response.status).toBe(200);

      // Verify conversation unread count reset
      const updatedConv = await conversationModel.findById(conversation._id);
      expect(updatedConv.unreadCount).toBe(0);
    });
  });

  describe('Conversations API', () => {
    beforeEach(async () => {
      const connection = await platformConnectionModel.create({
        organizationId: testOrgId,
        connectedBy: testUserId,
        platform: Platform.FACEBOOK,
        platformAccountId: FB_PAGE_ID,
        platformAccountName: 'Test Page',
        credentials: { accessToken: 'test_token' },
        status: ConnectionStatus.ACTIVE,
      });

      // Create multiple conversations
      for (let i = 1; i <= 5; i++) {
        await conversationModel.create({
          organizationId: testOrgId,
          platform: Platform.FACEBOOK,
          platformConversationId: `conv_${i}_page`,
          platformConnectionId: connection._id,
          platformAccountId: FB_PAGE_ID,
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

    it('GET /api/organizations/:orgId/conversations - should return list', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/conversations`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);
    });

    it('GET /api/organizations/:orgId/conversations - should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/conversations`)
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(5);
    });

    it('GET /api/organizations/:orgId/conversations - should filter by status', async () => {
      // Create a closed conversation
      const connection = await platformConnectionModel.findOne({});
      await conversationModel.create({
        organizationId: testOrgId,
        platform: Platform.FACEBOOK,
        platformConversationId: 'closed_conv',
        platformConnectionId: connection._id,
        platformAccountId: FB_PAGE_ID,
        customerPlatformUserId: 'closed_customer',
        customerName: 'Closed Customer',
        status: ConversationStatus.CLOSED,
        unreadCount: 0,
      });

      const openResponse = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/conversations`)
        .query({ status: 'open' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(openResponse.status).toBe(200);
      expect(openResponse.body.data.every((c: any) => c.status === 'open')).toBe(true);
    });

    it('GET /api/organizations/:orgId/conversations/:id - should return single conversation', async () => {
      const conv = await conversationModel.findOne({});

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/conversations/${conv._id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(conv._id.toString());
    });

    it('PATCH /api/organizations/:orgId/conversations/:id - should update conversation', async () => {
      const conv = await conversationModel.findOne({});

      const response = await request(app.getHttpServer())
        .patch(`/api/organizations/${testOrgId}/conversations/${conv._id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'closed' });

      expect(response.status).toBe(200);

      const updated = await conversationModel.findById(conv._id);
      expect(updated.status).toBe('closed');
    });
  });

  describe('Widget Public Endpoint', () => {
    it('GET /api/widget/:orgSlug/config - should return widget config', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/widget/test-org/config');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('GET /api/widget/:orgSlug/config - should return 404 for unknown org', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/widget/unknown-org/config');

      expect(response.status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in webhook', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/zalo/webhook')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields in message send', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/organizations/${testOrgId}/messages/send`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // Missing conversationId
          type: 'text',
          text: 'Test',
        });

      expect(response.status).toBe(400);
    });

    it('should handle non-existent conversation', async () => {
      const fakeConvId = new Types.ObjectId();

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${testOrgId}/conversations/${fakeConvId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });
});
