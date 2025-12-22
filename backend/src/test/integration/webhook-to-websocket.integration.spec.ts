/**
 * Integration Tests - Webhook to WebSocket Flow
 * Tests the full flow from webhook reception to WebSocket notification
 * Mocks: MongoDB (memory), Kafka (mock producer)
 * Verifies: Frontend receives WebSocket events when webhook arrives
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Platform,
  MessageDirection,
  ConnectionStatus,
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
import {
  Organization,
  OrganizationSchema,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { ZaloService } from '@/modules/platforms/zalo/zalo.service';
import { KafkaProducerService } from '@/infra/kafka/kafka-producer.service';
import { EnvService } from '@/common/env';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';
import { WebSocketBridgeConsumer } from '@/modules/websocket/websocket-bridge.consumer';
import { ZaloWebhookDto } from '@/modules/platforms/zalo/dto/zalo-webhook.dto';
import { VisitorMessageService } from '@/modules/websocket/visitor-message.service';
import { VisitorGateway } from '@/modules/websocket/visitor.gateway';

describe('Webhook to WebSocket Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;

  // Services
  let zaloService: ZaloService;
  let visitorMessageService: VisitorMessageService;
  let websocketBridgeConsumer: WebSocketBridgeConsumer;

  // Models
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let organizationModel: Model<OrganizationDocument>;

  // Mocks
  let mockKafkaProducer: jest.Mocked<KafkaProducerService>;
  let mockWebsocketGateway: jest.Mocked<WebsocketGateway>;
  let mockVisitorGateway: jest.Mocked<VisitorGateway>;

  // Test data
  const orgId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const zaloOaId = 'oa_zalo_123456';

  // Track all WebSocket emissions
  let wsEmissions: Array<{ event: string; userId: string; data: any }> = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Mock Kafka - capture published messages
    mockKafkaProducer = {
      publish: jest.fn().mockImplementation(async (topic, message) => {
        // Simulate Kafka consumer by immediately calling WebSocket bridge
        if (topic === 'websocket.notifications' && message.value) {
          // This simulates Kafka consumer receiving the message
          await websocketBridgeConsumer.handleNotification(message.value);
        }
        return undefined;
      }),
    } as any;

    // Mock WebSocket Gateway - capture all emissions
    mockWebsocketGateway = {
      emitToUser: jest.fn().mockImplementation((userId, event, data) => {
        wsEmissions.push({ event, userId, data });
      }),
      emitNewMessage: jest.fn().mockImplementation((userId, data) => {
        wsEmissions.push({ event: 'message:new', userId, data });
      }),
      emitConversationUpdated: jest.fn().mockImplementation((userId, data) => {
        wsEmissions.push({ event: 'conversation:updated', userId, data });
      }),
      emitMessageStatus: jest.fn(),
      emitMessagesRead: jest.fn(),
      emitToOrgAgents: jest.fn().mockImplementation((orgId, event, data) => {
        wsEmissions.push({ event, userId: `org:${orgId}`, data });
      }),
    } as any;

    mockVisitorGateway = {
      emitToVisitor: jest.fn().mockImplementation((sessionId, event, data) => {
        wsEmissions.push({ event, userId: `visitor:${sessionId}`, data });
      }),
      emitToOrgVisitors: jest.fn(),
    } as any;

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

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: PlatformConnection.name, schema: PlatformConnectionSchema },
          { name: Organization.name, schema: OrganizationSchema },
        ]),
      ],
      providers: [
        ZaloService,
        VisitorMessageService,
        WebSocketBridgeConsumer,
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
        { provide: VisitorGateway, useValue: mockVisitorGateway },
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    zaloService = module.get<ZaloService>(ZaloService);
    visitorMessageService = module.get<VisitorMessageService>(VisitorMessageService);
    websocketBridgeConsumer = module.get<WebSocketBridgeConsumer>(WebSocketBridgeConsumer);
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    platformConnectionModel = module.get<Model<PlatformConnectionDocument>>(
      getModelToken(PlatformConnection.name),
    );
    organizationModel = module.get<Model<OrganizationDocument>>(getModelToken(Organization.name));
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Reset emissions tracking
    wsEmissions = [];

    // Create test organization
    await organizationModel.create({
      _id: orgId,
      name: 'Test Organization',
      slug: 'test-org',
      owner: ownerId,
      isActive: true,
    });

    // Create Zalo platform connection
    await platformConnectionModel.create({
      organizationId: orgId,
      connectedBy: userId,
      platform: Platform.ZALO,
      platformAccountId: zaloOaId,
      platformAccountName: 'Test Zalo OA',
      credentials: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      },
      status: ConnectionStatus.ACTIVE,
    });
  });

  afterEach(async () => {
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await platformConnectionModel.deleteMany({});
    await organizationModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Zalo Webhook → WebSocket Flow', () => {
    it('should emit message:new to frontend when Zalo webhook arrives', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_001' },
        recipient: { id: zaloOaId },
        message: { text: 'Hello from Zalo!', msg_id: 'zalo_msg_001' },
        timestamp: Date.now().toString(),
      };

      // Process webhook
      await zaloService.processWebhook(payload);

      // Verify message was saved to DB
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toBe('Hello from Zalo!');

      // Verify WebSocket emissions
      const messageNewEvents = wsEmissions.filter(e => e.event === 'message:new');
      expect(messageNewEvents.length).toBeGreaterThan(0);

      // Verify the message:new event contains correct data
      const msgEvent = messageNewEvents[0];
      expect(msgEvent.userId).toBe(userId.toString());
      expect(msgEvent.data.conversationId).toBeDefined();
      expect(msgEvent.data.message).toBeDefined();
      expect(msgEvent.data.message.content.text).toBe('Hello from Zalo!');
      expect(msgEvent.data.message.direction).toBe(MessageDirection.INBOUND);
    });

    it('should emit conversation:updated to frontend when Zalo webhook arrives', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_002' },
        recipient: { id: zaloOaId },
        message: { text: 'New conversation!', msg_id: 'zalo_msg_002' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      // Verify conversation:updated was emitted
      const convUpdatedEvents = wsEmissions.filter(e => e.event === 'conversation:updated');
      expect(convUpdatedEvents.length).toBeGreaterThan(0);

      const convEvent = convUpdatedEvents[0];
      expect(convEvent.userId).toBe(userId.toString());
      expect(convEvent.data._id).toBeDefined();
      expect(convEvent.data.platform).toBe(Platform.ZALO);
    });

    it('should emit both message:new and conversation:updated for each webhook', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_003' },
        recipient: { id: zaloOaId },
        message: { text: 'Test both events', msg_id: 'zalo_msg_003' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      // Count each event type
      const messageEvents = wsEmissions.filter(e => e.event === 'message:new');
      const convEvents = wsEmissions.filter(e => e.event === 'conversation:updated');

      expect(messageEvents).toHaveLength(1);
      expect(convEvents).toHaveLength(1);
    });

    it('should handle multiple messages in sequence', async () => {
      const senderId = 'zalo_user_multi';

      // Send 3 messages
      for (let i = 1; i <= 3; i++) {
        const payload: ZaloWebhookDto = {
          event_name: 'user_send_text',
          app_id: 'app123',
          sender: { id: senderId },
          recipient: { id: zaloOaId },
          message: { text: `Message ${i}`, msg_id: `multi_msg_${i}` },
          timestamp: Date.now().toString(),
        };
        await zaloService.processWebhook(payload);
      }

      // Should have 3 messages in DB
      const messages = await messageModel.find({}).sort({ createdAt: 1 });
      expect(messages).toHaveLength(3);

      // Should have 3 message:new events
      const messageEvents = wsEmissions.filter(e => e.event === 'message:new');
      expect(messageEvents).toHaveLength(3);

      // Verify message order
      expect(messageEvents[0].data.message.content.text).toBe('Message 1');
      expect(messageEvents[1].data.message.content.text).toBe('Message 2');
      expect(messageEvents[2].data.message.content.text).toBe('Message 3');
    });
  });

  describe('Web Chat Visitor → WebSocket Flow', () => {
    it('should emit message:new to org agents when visitor sends message', async () => {
      const result = await visitorMessageService.processVisitorMessage({
        sessionId: 'visitor_session_001',
        organizationId: orgId.toString(),
        visitorName: 'Web Visitor',
        text: 'Hello from web chat!',
      });

      expect(result.messageId).toBeDefined();

      // Verify message was saved
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);

      // Verify WebSocket emission to org agents
      const orgEvents = wsEmissions.filter(e => e.userId === `org:${orgId}`);
      expect(orgEvents.length).toBeGreaterThan(0);

      const msgEvent = orgEvents.find(e => e.event === 'message:new');
      expect(msgEvent).toBeDefined();
      expect(msgEvent.data.message.content.text).toBe('Hello from web chat!');
    });

    it('should emit message:received to visitor when agent replies', async () => {
      // First, visitor sends a message
      const visitorResult = await visitorMessageService.processVisitorMessage({
        sessionId: 'visitor_session_002',
        organizationId: orgId.toString(),
        text: 'I need help',
      });

      // Clear emissions to track only agent reply
      wsEmissions = [];

      // Agent replies
      await visitorMessageService.sendToVisitor(
        visitorResult.conversationId.toString(),
        userId.toString(),
        'Agent Smith',
        { text: 'How can I help you?' },
      );

      // Verify emission to visitor
      const visitorEvents = wsEmissions.filter(e => e.userId.startsWith('visitor:'));
      expect(visitorEvents.length).toBeGreaterThan(0);

      const msgEvent = visitorEvents.find(e => e.event === 'message:received');
      expect(msgEvent).toBeDefined();
      expect(msgEvent.data.message.content.text).toBe('How can I help you?');
    });
  });

  describe('Error Scenarios', () => {
    it('should not emit WebSocket events when webhook processing fails', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'user_unknown' },
        recipient: { id: 'unknown_oa_id' }, // Non-existent OA
        message: { text: 'This should fail', msg_id: 'fail_msg' },
        timestamp: Date.now().toString(),
      };

      // This should throw
      await expect(zaloService.processWebhook(payload)).rejects.toThrow();

      // No messages should be saved
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(0);

      // No WebSocket events should be emitted
      expect(wsEmissions).toHaveLength(0);
    });

    it('should not emit duplicate events for duplicate webhooks', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_dup' },
        recipient: { id: zaloOaId },
        message: { text: 'Duplicate test', msg_id: 'dup_msg_001' },
        timestamp: Date.now().toString(),
      };

      // Process same webhook twice
      await zaloService.processWebhook(payload);
      const firstEmissionCount = wsEmissions.length;

      await zaloService.processWebhook(payload);
      const secondEmissionCount = wsEmissions.length;

      // Second call should not add more emissions (message was skipped as duplicate)
      expect(secondEmissionCount).toBe(firstEmissionCount);

      // Only 1 message in DB
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
    });
  });

  describe('WebSocket Event Payload Format', () => {
    it('message:new payload should have correct structure for frontend', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_format' },
        recipient: { id: zaloOaId },
        message: { text: 'Format test', msg_id: 'format_msg' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const msgEvent = wsEmissions.find(e => e.event === 'message:new');
      expect(msgEvent).toBeDefined();

      // Verify payload structure matches frontend expectations
      const { data } = msgEvent;
      expect(data).toHaveProperty('conversationId');
      expect(data).toHaveProperty('message');

      const { message } = data;
      expect(message).toHaveProperty('_id');
      expect(message).toHaveProperty('conversationId');
      expect(message).toHaveProperty('platform', Platform.ZALO);
      expect(message).toHaveProperty('direction', MessageDirection.INBOUND);
      expect(message).toHaveProperty('content');
      expect(message.content).toHaveProperty('text', 'Format test');
      expect(message).toHaveProperty('sender');
      expect(message.sender).toHaveProperty('platformUserId', 'zalo_user_format');
    });

    it('conversation:updated payload should have correct structure for frontend', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'zalo_user_conv' },
        recipient: { id: zaloOaId },
        message: { text: 'Conv format test', msg_id: 'conv_format_msg' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const convEvent = wsEmissions.find(e => e.event === 'conversation:updated');
      expect(convEvent).toBeDefined();

      // Verify payload structure
      const { data } = convEvent;
      expect(data).toHaveProperty('_id');
      expect(data).toHaveProperty('platform', Platform.ZALO);
      expect(data).toHaveProperty('lastMessage');
      expect(data).toHaveProperty('unreadCount');
    });
  });
});
