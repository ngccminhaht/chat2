/**
 * Integration Tests - Zalo Webhook Processing
 * Tests the full flow of Zalo message processing from webhook to database
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Platform,
  MessageStatus,
  MessageDirection,
  ConversationStatus,
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
import { ZaloWebhookDto } from '@/modules/platforms/zalo/dto/zalo-webhook.dto';

describe('Zalo Webhook Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let zaloService: ZaloService;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let platformConnectionModel: Model<PlatformConnectionDocument>;
  let organizationModel: Model<OrganizationDocument>;
  let mockKafkaProducer: jest.Mocked<KafkaProducerService>;

  // Test data
  const orgId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const oaId = 'oa123456789';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
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
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: EnvService, useValue: mockEnvService },
      ],
    }).compile();

    zaloService = module.get<ZaloService>(ZaloService);
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
    // Create org
    await organizationModel.create({
      _id: orgId,
      name: 'Test Organization',
      slug: 'test-org',
      owner: ownerId,
      isActive: true,
    });

    // Create platform connection
    await platformConnectionModel.create({
      organizationId: orgId,
      connectedBy: userId,
      platform: Platform.ZALO,
      platformAccountId: oaId,
      platformAccountName: 'Test OA',
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

  describe('Message Processing', () => {
    it('should create conversation and message for new sender', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'Hello', msg_id: 'msg_001' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      // Check conversation created
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(1);
      expect(conversations[0].platform).toBe(Platform.ZALO);
      expect(conversations[0].customerPlatformUserId).toBe('sender123');
      expect(conversations[0].organizationId.toString()).toBe(orgId.toString());

      // Check message created
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].platformMessageId).toBe('msg_001');
      expect(messages[0].direction).toBe(MessageDirection.INBOUND);
      expect(messages[0].content.text).toBe('Hello');
    });

    it('should add message to existing conversation', async () => {
      // First message
      const payload1: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'Hello', msg_id: 'msg_001' },
        timestamp: Date.now().toString(),
      };
      await zaloService.processWebhook(payload1);

      // Second message from same sender
      const payload2: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'How are you?', msg_id: 'msg_002' },
        timestamp: (Date.now() + 1000).toString(),
      };
      await zaloService.processWebhook(payload2);

      // Should have 1 conversation
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(1);

      // Should have 2 messages
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(2);
      expect(messages.map(m => m.platformMessageId).sort()).toEqual(['msg_001', 'msg_002']);
    });

    it('should skip duplicate messages', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'Hello', msg_id: 'msg_duplicate' },
        timestamp: Date.now().toString(),
      };

      // Process same webhook 3 times
      await zaloService.processWebhook(payload);
      await zaloService.processWebhook(payload);
      await zaloService.processWebhook(payload);

      // Should only have 1 message
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
    });

    it('should handle concurrent duplicate webhooks (race condition)', async () => {
      // First, create the conversation to avoid race condition on conversation creation
      const senderId = 'sender_race_test';
      const initialPayload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: { text: 'Initial', msg_id: 'msg_initial' },
        timestamp: Date.now().toString(),
      };
      await zaloService.processWebhook(initialPayload);

      // Now test concurrent duplicate messages
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: { text: 'Race test', msg_id: 'msg_race' },
        timestamp: Date.now().toString(),
      };

      // Process 10 times concurrently
      const promises = Array(10).fill(null).map(() => zaloService.processWebhook(payload));
      await Promise.all(promises);

      // Should only have 2 messages (initial + 1 race test)
      const messages = await messageModel.find({ 'sender.platformUserId': senderId });
      expect(messages).toHaveLength(2);
    });

    it('should update conversation lastMessage and unreadCount', async () => {
      const senderId = 'sender_lastmsg_test';
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: { text: 'Latest message', msg_id: 'msg_latest' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const conversation = await conversationModel.findOne({ customerPlatformUserId: senderId });
      expect(conversation.lastMessage.text).toBe('Latest message');
      expect(conversation.unreadCount).toBe(1);

      // Send another message
      const payload2: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: { text: 'Another message', msg_id: 'msg_another' },
        timestamp: (Date.now() + 1000).toString(),
      };
      await zaloService.processWebhook(payload2);

      const updatedConversation = await conversationModel.findOne({ customerPlatformUserId: senderId });
      expect(updatedConversation.lastMessage.text).toBe('Another message');
      expect(updatedConversation.unreadCount).toBe(2);
    });
  });

  describe('Message Types', () => {
    it('should handle image messages', async () => {
      const senderId = 'sender_image_test';
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_image',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: {
          msg_id: 'msg_image',
          attachments: [{ type: 'image', payload: { url: 'https://example.com/image.jpg' } }],
        },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const message = await messageModel.findOne({ 'sender.platformUserId': senderId });
      expect(message.type).toBe('image');
    });

    it('should handle file messages', async () => {
      const senderId = 'sender_file_test';
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_file',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: {
          msg_id: 'msg_file',
          attachments: [{ type: 'file', payload: { url: 'https://example.com/doc.pdf' } }],
        },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const message = await messageModel.findOne({ 'sender.platformUserId': senderId });
      expect(message.type).toBe('file');
    });

    it('should handle sticker messages', async () => {
      const senderId = 'sender_sticker_test';
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_sticker',
        app_id: 'app123',
        sender: { id: senderId },
        recipient: { id: oaId },
        message: {
          msg_id: 'msg_sticker',
          attachments: [{ type: 'sticker', payload: { id: 'sticker123' } }],
        },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      const message = await messageModel.findOne({ 'sender.platformUserId': senderId });
      expect(message.type).toBe('sticker');
    });
  });

  describe('WebSocket Notifications', () => {
    it('should publish message:new notification to Kafka', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'Hello', msg_id: 'msg_notify' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        'websocket.notifications',
        expect.objectContaining({
          key: userId.toString(),
          value: expect.objectContaining({
            type: 'message:new',
            userId: userId.toString(),
          }),
        }),
      );
    });

    it('should publish conversation:updated notification to Kafka', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: oaId },
        message: { text: 'Hello', msg_id: 'msg_conv_update' },
        timestamp: Date.now().toString(),
      };

      await zaloService.processWebhook(payload);

      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        'websocket.notifications',
        expect.objectContaining({
          key: userId.toString(),
          value: expect.objectContaining({
            type: 'conversation:updated',
            userId: userId.toString(),
          }),
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error when platform connection not found', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: { id: 'unknown_oa' }, // Unknown OA ID
        message: { text: 'Hello', msg_id: 'msg_unknown' },
        timestamp: Date.now().toString(),
      };

      await expect(zaloService.processWebhook(payload)).rejects.toThrow();
    });

    it('should throw error when OA ID is missing', async () => {
      const payload: ZaloWebhookDto = {
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender123' },
        recipient: undefined as any,
        message: { text: 'Hello', msg_id: 'msg_no_oa' },
        timestamp: Date.now().toString(),
      };

      await expect(zaloService.processWebhook(payload)).rejects.toThrow('Missing OA ID');
    });
  });

  describe('Multiple Senders', () => {
    it('should create separate conversations for different senders', async () => {
      // Message from sender 1
      await zaloService.processWebhook({
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender_A' },
        recipient: { id: oaId },
        message: { text: 'Hello from A', msg_id: 'msg_A' },
        timestamp: Date.now().toString(),
      });

      // Message from sender 2
      await zaloService.processWebhook({
        event_name: 'user_send_text',
        app_id: 'app123',
        sender: { id: 'sender_B' },
        recipient: { id: oaId },
        message: { text: 'Hello from B', msg_id: 'msg_B' },
        timestamp: Date.now().toString(),
      });

      // Should have 2 conversations
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(2);
      expect(conversations.map(c => c.customerPlatformUserId).sort()).toEqual(['sender_A', 'sender_B']);

      // Should have 2 messages
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(2);
    });
  });
});
