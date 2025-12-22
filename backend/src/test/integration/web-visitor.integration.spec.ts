/**
 * Integration Tests - Web Visitor Message Processing
 * Tests the full flow of web chat messages from visitor to agent
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
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
  Organization,
  OrganizationSchema,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { VisitorMessageService } from '@/modules/websocket/visitor-message.service';
import { WebsocketGateway } from '@/modules/websocket/websocket.gateway';
import { VisitorGateway } from '@/modules/websocket/visitor.gateway';

describe('Web Visitor Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let visitorMessageService: VisitorMessageService;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let organizationModel: Model<OrganizationDocument>;
  let mockWebsocketGateway: jest.Mocked<WebsocketGateway>;
  let mockVisitorGateway: jest.Mocked<VisitorGateway>;

  // Test data
  const orgId = new Types.ObjectId();
  const agentId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    mockWebsocketGateway = {
      emitNewMessage: jest.fn(),
      emitConversationUpdated: jest.fn(),
      emitToOrgAgents: jest.fn(),
      emitToUser: jest.fn(),
    } as any;

    mockVisitorGateway = {
      emitToVisitor: jest.fn(),
      emitToOrgVisitors: jest.fn(),
    } as any;

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: Organization.name, schema: OrganizationSchema },
        ]),
      ],
      providers: [
        VisitorMessageService,
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
        { provide: VisitorGateway, useValue: mockVisitorGateway },
      ],
    }).compile();

    visitorMessageService = module.get<VisitorMessageService>(VisitorMessageService);
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    organizationModel = module.get<Model<OrganizationDocument>>(getModelToken(Organization.name));
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Create organization
    await organizationModel.create({
      _id: orgId,
      name: 'Test Organization',
      slug: 'test-org',
      owner: ownerId,
      isActive: true,
    });
  });

  afterEach(async () => {
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await organizationModel.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Visitor Message Processing', () => {
    it('should create conversation and message for new visitor', async () => {
      const result = await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        visitorName: 'John Doe',
        visitorEmail: 'john@example.com',
        text: 'Hello, I need help',
      });

      // Check result
      expect(result.messageId).toBeDefined();
      expect(result.conversationId).toBeDefined();
      expect(result.timestamp).toBeDefined();

      // Check conversation created
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(1);
      expect(conversations[0].platform).toBe(Platform.WEB);
      expect(conversations[0].customerName).toBe('John Doe');
      expect(conversations[0].organizationId.toString()).toBe(orgId.toString());
      expect(conversations[0].platformConversationId).toBe(`web_${orgId}_session_001`);

      // Check message created
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(1);
      expect(messages[0].direction).toBe(MessageDirection.INBOUND);
      expect(messages[0].content.text).toBe('Hello, I need help');
      expect(messages[0].sender.name).toBe('John Doe');
    });

    it('should add message to existing conversation', async () => {
      // First message
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Hello',
      });

      // Second message
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Are you there?',
      });

      // Should have 1 conversation
      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(1);

      // Should have 2 messages
      const messages = await messageModel.find({});
      expect(messages).toHaveLength(2);
    });

    it('should handle media messages', async () => {
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        type: MessageType.IMAGE,
        mediaUrl: 'https://example.com/screenshot.png',
        fileName: 'screenshot.png',
      });

      const message = await messageModel.findOne({});
      expect(message.type).toBe(MessageType.IMAGE);
      expect(message.content.mediaUrl).toBe('https://example.com/screenshot.png');
      expect(message.content.fileName).toBe('screenshot.png');
    });

    it('should update conversation lastMessage', async () => {
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'First message',
      });

      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Second message',
      });

      const conversation = await conversationModel.findOne({});
      expect(conversation.lastMessage.text).toBe('Second message');
    });

    it('should notify agents via WebSocket', async () => {
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Help me please',
      });

      expect(mockWebsocketGateway.emitToOrgAgents).toHaveBeenCalledWith(
        orgId.toString(),
        'message:new',
        expect.objectContaining({
          conversationId: expect.any(Object),
          message: expect.objectContaining({
            content: { text: 'Help me please', mediaUrl: undefined, fileName: undefined },
          }),
        }),
      );

      expect(mockWebsocketGateway.emitToOrgAgents).toHaveBeenCalledWith(
        orgId.toString(),
        'conversation:updated',
        expect.any(Object),
      );
    });
  });

  describe('Agent Reply to Visitor', () => {
    it('should create outbound message and notify visitor', async () => {
      // First, visitor sends a message
      const visitorResult = await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Hello',
      });

      // Agent replies
      const result = await visitorMessageService.sendToVisitor(
        visitorResult.conversationId.toString(),
        agentId.toString(),
        'Agent Smith',
        { text: 'Hi! How can I help you?' },
      );

      // sessionId extracted from platformConversationId: web_{orgId}_{sessionId}
      // The last part after splitting by '_' is the sessionId
      expect(result.sessionId).toBeDefined();
      expect(result.message).toBeDefined();

      // Should have 2 messages
      const messages = await messageModel.find({}).sort({ createdAt: 1 });
      expect(messages).toHaveLength(2);
      expect(messages[1].direction).toBe(MessageDirection.OUTBOUND);
      expect(messages[1].content.text).toBe('Hi! How can I help you?');
      expect(messages[1].sender.name).toBe('Agent Smith');
    });

    it('should notify visitor via VisitorGateway', async () => {
      // Visitor message
      const visitorResult = await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Hello',
      });

      // Agent reply
      await visitorMessageService.sendToVisitor(
        visitorResult.conversationId.toString(),
        agentId.toString(),
        'Agent Smith',
        { text: 'Hello!' },
      );

      expect(mockVisitorGateway.emitToVisitor).toHaveBeenCalledWith(
        expect.any(String), // sessionId extracted from platformConversationId
        'message:received',
        expect.objectContaining({
          message: expect.objectContaining({
            content: expect.objectContaining({ text: 'Hello!' }),
          }),
        }),
      );
    });

    it('should throw error when conversation not found', async () => {
      await expect(
        visitorMessageService.sendToVisitor(
          new Types.ObjectId().toString(),
          agentId.toString(),
          'Agent',
          { text: 'Hi' },
        ),
      ).rejects.toThrow('Conversation not found or not a web chat');
    });
  });

  describe('Existing Conversation Retrieval', () => {
    it('should return existing conversation with messages', async () => {
      // Create conversation with messages
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Message 1',
      });

      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Message 2',
      });

      const result = await visitorMessageService.getExistingConversation(
        orgId.toString(),
        'session_001',
      );

      expect(result).not.toBeNull();
      expect(result._id).toBeDefined();
      expect(result.messages).toHaveLength(2);
    });

    it('should return null for non-existent conversation', async () => {
      const result = await visitorMessageService.getExistingConversation(
        orgId.toString(),
        'nonexistent_session',
      );

      expect(result).toBeNull();
    });
  });

  describe('Visitor Info Update', () => {
    it('should update visitor info in conversation', async () => {
      // Create conversation
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_001',
        organizationId: orgId.toString(),
        text: 'Hello',
      });

      // Update visitor info
      await visitorMessageService.updateVisitorInfo(
        orgId.toString(),
        'session_001',
        {
          name: 'Updated Name',
          email: 'updated@example.com',
          phone: '+1234567890',
        },
      );

      const conversation = await conversationModel.findOne({});
      expect(conversation.customerName).toBe('Updated Name');
      expect(conversation.metadata?.visitorEmail).toBe('updated@example.com');
      expect(conversation.metadata?.visitorPhone).toBe('+1234567890');
    });
  });

  describe('Multiple Visitors', () => {
    it('should create separate conversations for different visitors', async () => {
      // Visitor 1
      await visitorMessageService.processVisitorMessage({
        sessionId: 'visitor_A',
        organizationId: orgId.toString(),
        visitorName: 'Alice',
        text: 'Hello from Alice',
      });

      // Visitor 2
      await visitorMessageService.processVisitorMessage({
        sessionId: 'visitor_B',
        organizationId: orgId.toString(),
        visitorName: 'Bob',
        text: 'Hello from Bob',
      });

      const conversations = await conversationModel.find({});
      expect(conversations).toHaveLength(2);
      expect(conversations.map(c => c.customerName).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('Full Conversation Flow', () => {
    it('should handle complete visitor-agent conversation flow', async () => {
      // 1. Visitor initiates chat
      const msg1 = await visitorMessageService.processVisitorMessage({
        sessionId: 'session_flow',
        organizationId: orgId.toString(),
        visitorName: 'Customer',
        text: 'I need help with my order',
      });

      // 2. Agent replies
      await visitorMessageService.sendToVisitor(
        msg1.conversationId.toString(),
        agentId.toString(),
        'Support Agent',
        { text: 'Sure! What is your order number?' },
      );

      // 3. Visitor responds
      await visitorMessageService.processVisitorMessage({
        sessionId: 'session_flow',
        organizationId: orgId.toString(),
        text: 'Order #12345',
      });

      // 4. Agent resolves
      await visitorMessageService.sendToVisitor(
        msg1.conversationId.toString(),
        agentId.toString(),
        'Support Agent',
        { text: 'Found it! Your order is on the way.' },
      );

      // Verify conversation state
      const conversation = await conversationModel.findOne({});
      expect(conversation.status).toBe(ConversationStatus.OPEN);
      expect(conversation.lastMessage.text).toBe('Found it! Your order is on the way.');

      // Verify all 4 messages exist
      const messages = await messageModel.find({ conversationId: msg1.conversationId }).sort({ createdAt: 1 });
      expect(messages).toHaveLength(4);
      expect(messages[0].direction).toBe(MessageDirection.INBOUND);
      expect(messages[1].direction).toBe(MessageDirection.OUTBOUND);
      expect(messages[2].direction).toBe(MessageDirection.INBOUND);
      expect(messages[3].direction).toBe(MessageDirection.OUTBOUND);
    });
  });
});
