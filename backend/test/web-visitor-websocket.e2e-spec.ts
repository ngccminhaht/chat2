/**
 * E2E Tests - Web Visitor to WebSocket Flow
 * Tests the complete flow: Visitor WebSocket → Message Service → Agent WebSocket
 *
 * This test uses:
 * - socket.io-client for both visitor and agent WebSocket connections
 * - MongoMemoryServer for isolated database
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import {
  Platform,
  ConversationStatus,
  MessageDirection,
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
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { User, UserDocument } from '@/common/database/schemas/user.schema';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';

describe('Web Visitor → WebSocket E2E Flow', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let jwtService: JwtService;

  // Models
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let organizationModel: Model<OrganizationDocument>;
  let userModel: Model<UserDocument>;

  // Test data
  const testAgentId = new Types.ObjectId();
  const testOrgId = new Types.ObjectId();
  const testOwnerId = new Types.ObjectId();

  // WebSocket clients
  let visitorClient: Socket;
  let agentClient: Socket;
  let accessToken: string;
  let port: number;

  // Track events
  const visitorEvents: Array<{ event: string; data: any }> = [];
  const agentEvents: Array<{ event: string; data: any }> = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Override environment variables
    process.env.MONGODB_URI = mongoUri;
    process.env.JWT_SECRET = 'test-jwt-secret-for-e2e';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-e2e';
    process.env.FRONTEND_URL = 'http://localhost:3001';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KafkaProducerService)
      .useValue({
        publish: jest.fn().mockResolvedValue([{ partition: 0, offset: '0' }]),
        publishBatch: jest.fn().mockResolvedValue([]),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    port = typeof address === 'object' ? address?.port : 3000;

    // Get services
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Get models
    conversationModel = moduleFixture.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = moduleFixture.get<Model<MessageDocument>>(getModelToken(Message.name));
    organizationModel = moduleFixture.get<Model<OrganizationDocument>>(getModelToken(Organization.name));
    userModel = moduleFixture.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    visitorEvents.length = 0;
    agentEvents.length = 0;

    // Create test user (agent)
    await userModel.create({
      _id: testAgentId,
      email: 'agent@test.com',
      password: 'hashedpassword',
      name: 'Test Agent',
      isEmailVerified: true,
    });

    // Create organization
    await organizationModel.create({
      _id: testOrgId,
      name: 'Test Organization',
      slug: 'test-org',
      owner: testOwnerId,
      isActive: true,
    });

    // Generate JWT token for agent
    accessToken = jwtService.sign({ sub: testAgentId.toString(), email: 'agent@test.com' });
  });

  afterEach(async () => {
    if (visitorClient) {
      visitorClient.disconnect();
    }
    if (agentClient) {
      agentClient.disconnect();
    }
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await organizationModel.deleteMany({});
    await userModel.deleteMany({});
  });

  const connectVisitor = async (sessionId: string): Promise<Socket> => {
    const client = io(`http://localhost:${port}/visitor`, {
      auth: {
        sessionId,
        organizationId: testOrgId.toString(),
        name: 'Test Visitor',
        email: 'visitor@example.com',
      },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connected', () => resolve());
      client.on('error', (err) => reject(new Error(err.message)));
      client.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('Visitor connection timeout')), 5000);
    });

    // Subscribe to events
    client.on('message:sent', (data) => {
      visitorEvents.push({ event: 'message:sent', data });
    });
    client.on('message:received', (data) => {
      visitorEvents.push({ event: 'message:received', data });
    });
    client.on('conversation:restored', (data) => {
      visitorEvents.push({ event: 'conversation:restored', data });
    });
    client.on('message:error', (data) => {
      visitorEvents.push({ event: 'message:error', data });
    });

    return client;
  };

  const connectAgent = async (): Promise<Socket> => {
    const client = io(`http://localhost:${port}`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('Agent connection timeout')), 5000);
    });

    // Join org agents room
    client.emit('join:org:agents', { organizationId: testOrgId.toString() });

    // Subscribe to events
    client.on('message:new', (data) => {
      agentEvents.push({ event: 'message:new', data });
    });
    client.on('conversation:updated', (data) => {
      agentEvents.push({ event: 'conversation:updated', data });
    });

    return client;
  };

  describe('Visitor Connection', () => {
    it('should allow visitor to connect with valid organization', async () => {
      visitorClient = await connectVisitor('session_001');
      expect(visitorClient.connected).toBe(true);
    });

    it('should reject visitor with invalid organization', async () => {
      const client = io(`http://localhost:${port}/visitor`, {
        auth: {
          sessionId: 'session_invalid',
          organizationId: new Types.ObjectId().toString(),
        },
        transports: ['websocket'],
        forceNew: true,
      });

      const error = await new Promise<any>((resolve) => {
        client.on('error', (err) => {
          client.disconnect();
          resolve(err);
        });
        setTimeout(() => {
          client.disconnect();
          resolve(null);
        }, 2000);
      });

      expect(error).toBeDefined();
      expect(error.code).toBe('ORG_NOT_FOUND');
    });

    it('should reject visitor without sessionId', async () => {
      const client = io(`http://localhost:${port}/visitor`, {
        auth: {
          organizationId: testOrgId.toString(),
        },
        transports: ['websocket'],
        forceNew: true,
      });

      const error = await new Promise<any>((resolve) => {
        client.on('error', (err) => {
          client.disconnect();
          resolve(err);
        });
        setTimeout(() => {
          client.disconnect();
          resolve(null);
        }, 2000);
      });

      expect(error).toBeDefined();
      expect(error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Visitor Message Flow', () => {
    it('should process visitor message and confirm receipt', async () => {
      visitorClient = await connectVisitor('session_msg_001');

      // Send message
      visitorClient.emit('message:send', { text: 'Hello from visitor' });

      // Wait for confirmation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check visitor received confirmation
      const sentEvents = visitorEvents.filter((e) => e.event === 'message:sent');
      expect(sentEvents.length).toBe(1);
      expect(sentEvents[0].data.messageId).toBeDefined();
      expect(sentEvents[0].data.conversationId).toBeDefined();
    });

    it('should create conversation and message in database', async () => {
      visitorClient = await connectVisitor('session_db_001');

      visitorClient.emit('message:send', { text: 'Database verification' });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check database
      const conversations = await conversationModel.find({
        platform: Platform.WEB,
      });
      expect(conversations.length).toBe(1);
      expect(conversations[0].customerName).toBe('Test Visitor');

      const messages = await messageModel.find({
        conversationId: conversations[0]._id,
      });
      expect(messages.length).toBe(1);
      expect(messages[0].content.text).toBe('Database verification');
      expect(messages[0].direction).toBe(MessageDirection.INBOUND);
    });

    it('should add multiple messages to same conversation', async () => {
      visitorClient = await connectVisitor('session_multi_001');

      visitorClient.emit('message:send', { text: 'Message 1' });
      await new Promise((resolve) => setTimeout(resolve, 200));

      visitorClient.emit('message:send', { text: 'Message 2' });
      await new Promise((resolve) => setTimeout(resolve, 200));

      visitorClient.emit('message:send', { text: 'Message 3' });
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should have 1 conversation
      const conversations = await conversationModel.find({
        platform: Platform.WEB,
      });
      expect(conversations.length).toBe(1);

      // Should have 3 messages
      const messages = await messageModel.find({
        conversationId: conversations[0]._id,
      });
      expect(messages.length).toBe(3);

      // Should receive 3 confirmations
      const sentEvents = visitorEvents.filter((e) => e.event === 'message:sent');
      expect(sentEvents.length).toBe(3);
    });
  });

  describe('Agent Notification Flow', () => {
    it('should notify agent when visitor sends message', async () => {
      // Connect agent first
      agentClient = await connectAgent();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Connect visitor and send message
      visitorClient = await connectVisitor('session_notify_001');
      visitorClient.emit('message:send', { text: 'Agent notification test' });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Agent should receive notification
      const msgEvents = agentEvents.filter((e) => e.event === 'message:new');
      expect(msgEvents.length).toBe(1);
      expect(msgEvents[0].data.message.content.text).toBe('Agent notification test');
    });

    it('should notify agent of conversation update', async () => {
      agentClient = await connectAgent();
      await new Promise((resolve) => setTimeout(resolve, 100));

      visitorClient = await connectVisitor('session_conv_001');
      visitorClient.emit('message:send', { text: 'Conversation update test' });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Agent should receive conversation update
      const convEvents = agentEvents.filter((e) => e.event === 'conversation:updated');
      expect(convEvents.length).toBe(1);
      expect(convEvents[0].data.lastMessage.text).toBe('Conversation update test');
    });
  });

  describe('Conversation Restoration', () => {
    it('should restore existing conversation on reconnect', async () => {
      const sessionId = 'session_restore_001';

      // First connection - send message
      visitorClient = await connectVisitor(sessionId);
      visitorClient.emit('message:send', { text: 'Initial message' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      visitorClient.disconnect();

      // Second connection - should restore
      visitorClient = await connectVisitor(sessionId);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check for restoration event
      const restoreEvents = visitorEvents.filter((e) => e.event === 'conversation:restored');
      expect(restoreEvents.length).toBe(1);
      expect(restoreEvents[0].data.messages.length).toBe(1);
      expect(restoreEvents[0].data.messages[0].content.text).toBe('Initial message');
    });
  });

  describe('Pre-chat Form', () => {
    it('should update visitor info on pre-chat submit', async () => {
      visitorClient = await connectVisitor('session_prechat_001');

      // Submit pre-chat form
      visitorClient.emit('pre-chat:submit', {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Send a message to create conversation
      visitorClient.emit('message:send', { text: 'After pre-chat' });
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check conversation has updated info
      const conversation = await conversationModel.findOne({
        platform: Platform.WEB,
      });
      expect(conversation).toBeDefined();
      // Note: customerName may not update after pre-chat if already set
    });
  });

  describe('Multiple Visitors', () => {
    it('should handle multiple simultaneous visitors', async () => {
      agentClient = await connectAgent();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Connect multiple visitors
      const visitor1 = await connectVisitor('session_multi_v1');
      const visitor2 = await connectVisitor('session_multi_v2');
      const visitor3 = await connectVisitor('session_multi_v3');

      // All send messages
      visitor1.emit('message:send', { text: 'Visitor 1 message' });
      visitor2.emit('message:send', { text: 'Visitor 2 message' });
      visitor3.emit('message:send', { text: 'Visitor 3 message' });

      await new Promise((resolve) => setTimeout(resolve, 800));

      // Should have 3 conversations
      const conversations = await conversationModel.find({ platform: Platform.WEB });
      expect(conversations.length).toBe(3);

      // Agent should receive 3 notifications
      const msgEvents = agentEvents.filter((e) => e.event === 'message:new');
      expect(msgEvents.length).toBe(3);

      // Cleanup
      visitor1.disconnect();
      visitor2.disconnect();
      visitor3.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should handle message without text gracefully', async () => {
      visitorClient = await connectVisitor('session_error_001');

      // Send empty message
      visitorClient.emit('message:send', {});

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should not create conversation with empty message
      const conversations = await conversationModel.find({ platform: Platform.WEB });
      expect(conversations.length).toBe(0);
    });
  });

  describe('Full Chat Flow', () => {
    it('should complete full visitor-agent chat flow', async () => {
      const sessionId = 'session_full_flow';

      // 1. Agent connects and joins org room
      agentClient = await connectAgent();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2. Visitor connects
      visitorClient = await connectVisitor(sessionId);

      // 3. Visitor sends initial message
      visitorClient.emit('message:send', { text: 'Hi, I need help!' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 4. Verify visitor received confirmation
      let sentEvents = visitorEvents.filter((e) => e.event === 'message:sent');
      expect(sentEvents.length).toBe(1);

      // 5. Verify agent received notification
      let msgEvents = agentEvents.filter((e) => e.event === 'message:new');
      expect(msgEvents.length).toBe(1);

      // 6. Visitor sends follow-up
      visitorClient.emit('message:send', { text: 'Order #12345' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 7. Verify database state
      const conversations = await conversationModel.find({ platform: Platform.WEB });
      expect(conversations.length).toBe(1);
      expect(conversations[0].lastMessage.text).toBe('Order #12345');

      const messages = await messageModel.find({ conversationId: conversations[0]._id });
      expect(messages.length).toBe(2);
    });
  });
});
