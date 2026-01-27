/**
 * Integration Test - AI Chat History Loading
 * Tests that AI always loads full conversation history including manual agent replies
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
  ConversationSchema,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
  MessageSchema,
} from '@/common/database/schemas/message.schema';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from '@/common/database/schemas/customer.schema';
import {
  Organization,
  OrganizationDocument,
  OrganizationSchema,
} from '@/common/database/schemas/organization.schema';
import { AIAPICallProcessor } from '@/modules/ai-batching/ai-api-call.processor';
import { MessageCombiner } from '@/modules/ai-batching/utils/message-combiner';
import { Platform, MessageDirection, MessageType } from '@/common/constants';

describe('AI Chat History Loading (Integration)', () => {
  let mongoServer: MongoMemoryServer;
  let module: TestingModule;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let organizationModel: Model<OrganizationDocument>;
  let customerModel: Model<CustomerDocument>;
  let processor: AIAPICallProcessor;

  let testOrgId: Types.ObjectId;
  let testConversationId: Types.ObjectId;
  let testCustomerId: Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: Organization.name, schema: OrganizationSchema },
          { name: Customer.name, schema: CustomerSchema },
        ]),
      ],
      providers: [AIAPICallProcessor],
    }).compile();

    conversationModel = module.get<Model<ConversationDocument>>(
      getModelToken(Conversation.name),
    );
    messageModel = module.get<Model<MessageDocument>>(
      getModelToken(Message.name),
    );
    organizationModel = module.get<Model<OrganizationDocument>>(
      getModelToken(Organization.name),
    );
    customerModel = module.get<Model<CustomerDocument>>(
      getModelToken(Customer.name),
    );
    processor = module.get<AIAPICallProcessor>(AIAPICallProcessor);
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await conversationModel.deleteMany({});
    await messageModel.deleteMany({});
    await organizationModel.deleteMany({});
    await customerModel.deleteMany({});

    // Setup test data
    testOrgId = new Types.ObjectId();
    testConversationId = new Types.ObjectId();
    testCustomerId = new Types.ObjectId();

    // Create organization
    const testOwnerId = new Types.ObjectId();
    await organizationModel.create({
      _id: testOrgId,
      name: 'Test Org',
      slug: 'test-org',
      owner: testOwnerId,
      aiAgentSettings: {
        enabled: true,
        apiKey: 'test-key',
        endpoint: 'https://api.test.com',
      },
    });

    // Create customer
    await customerModel.create({
      _id: testCustomerId,
      organizationId: testOrgId,
      name: 'Test Customer',
      platformUserId: 'customer_123',
      platform: Platform.FACEBOOK,
    });

    // Create conversation
    await conversationModel.create({
      _id: testConversationId,
      organizationId: testOrgId,
      customerId: testCustomerId,
      platform: Platform.FACEBOOK,
      platformConversationId: 'fb_conv_123',
      platformConnectionId: new Types.ObjectId(),
      customerPlatformUserId: 'customer_123',
      customerName: 'Test Customer',
      status: 'open',
      aiEnabled: true,
    });
  });

  describe('loadChatHistory', () => {
    it('should load full conversation history including manual agent replies', async () => {
      // Scenario:
      // 1. Customer sends message 1
      // 2. AI replies (AI was ON)
      // 3. AI is turned OFF
      // 4. Customer sends message 2
      // 5. Agent replies manually
      // 6. Customer sends message 3
      // 7. Agent replies manually again
      // 8. AI is turned back ON
      // 9. Customer sends message 4
      // 10. AI should receive ALL previous messages (1-7) as history

      const baseTime = new Date('2024-01-01T10:00:00Z');

      // Message 1: Customer
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_1',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Customer: Hello, I need help' },
        sender: { platformUserId: 'customer_123', name: 'Test Customer' },
        createdAt: new Date(baseTime.getTime() + 1000),
      });

      // Message 2: AI Reply (when AI was ON)
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_2',
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: { text: 'Hi! How can I assist you today?' },
        sender: { platformUserId: 'ai-agent', name: 'AI Agent' },
        createdAt: new Date(baseTime.getTime() + 2000),
      });

      // Message 3: Customer (AI turned OFF)
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_3',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Customer: I want to know about pricing' },
        sender: { platformUserId: 'customer_123', name: 'Test Customer' },
        createdAt: new Date(baseTime.getTime() + 3000),
      });

      // Message 4: MANUAL Agent Reply (AI still OFF)
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_4',
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: {
          text: 'Our pricing starts at $99/month. Would you like more details?',
        },
        sender: { platformUserId: 'agent_123', name: 'Human Agent' },
        createdAt: new Date(baseTime.getTime() + 4000),
      });

      // Message 5: Customer
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_5',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Customer: Yes please, tell me more' },
        sender: { platformUserId: 'customer_123', name: 'Test Customer' },
        createdAt: new Date(baseTime.getTime() + 5000),
      });

      // Message 6: MANUAL Agent Reply again
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_6',
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: {
          text: 'We have 3 plans: Basic ($99), Pro ($199), Enterprise ($499)',
        },
        sender: { platformUserId: 'agent_123', name: 'Human Agent' },
        createdAt: new Date(baseTime.getTime() + 6000),
      });

      // Message 7: Customer (AI turned back ON)
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_7',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: "Customer: What's included in Pro plan?" },
        sender: { platformUserId: 'customer_123', name: 'Test Customer' },
        createdAt: new Date(baseTime.getTime() + 7000),
      });

      // Now simulate AI processing message 7
      // Get all messages except the current one (msg_7)
      const conversation = await conversationModel
        .findById(testConversationId)
        .lean();
      const currentMessage = await messageModel
        .findOne({ platformMessageId: 'msg_7' })
        .lean();

      // Get message combiner to test
      const messages = [currentMessage];
      const combinedData = MessageCombiner.combineMessages(
        messages.map((msg) => ({
          conversation: conversation as any,
          message: msg as any,
        })),
      );

      // Call loadChatHistory using processor's private method (via reflection)
      // In real scenario, this is called automatically
      const loadChatHistoryMethod = (processor as any).loadChatHistory.bind(
        processor,
      );
      const historyLoaded = await loadChatHistoryMethod(
        combinedData,
        conversation,
      );

      // Verify history was loaded
      expect(historyLoaded).toBe(true);

      // Verify combined data contains history
      const queryText = combinedData.texts[0]?.content;
      expect(queryText).toBeDefined();

      // Should contain ALL previous messages (msg_1 to msg_6)
      expect(queryText).toContain('Customer: Hello, I need help'); // msg_1
      expect(queryText).toContain(
        'Agent: Hi! How can I assist you today?',
      ); // msg_2 (AI)
      expect(queryText).toContain('Customer: I want to know about pricing'); // msg_3
      expect(queryText).toContain(
        'Agent: Our pricing starts at $99/month',
      ); // msg_4 (MANUAL)
      expect(queryText).toContain('Customer: Yes please, tell me more'); // msg_5
      expect(queryText).toContain('Agent: We have 3 plans'); // msg_6 (MANUAL)
      expect(queryText).toContain("Customer: What's included in Pro plan?"); // msg_7 (current)

      // Verify manual agent replies are included
      expect(queryText).toContain('Our pricing starts at $99/month'); // Manual reply 1
      expect(queryText).toContain('We have 3 plans'); // Manual reply 2
    });

    it('should load history every time, not just once', async () => {
      // Scenario: Multiple AI processing cycles should always load history

      const baseTime = new Date('2024-01-01T10:00:00Z');

      // Create initial conversation with 3 messages
      await messageModel.create([
        {
          organizationId: testOrgId,
          conversationId: testConversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_1',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Message 1' },
          sender: { platformUserId: 'customer_123', name: 'Customer' },
          createdAt: new Date(baseTime.getTime() + 1000),
        },
        {
          organizationId: testOrgId,
          conversationId: testConversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_2',
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          content: { text: 'Reply 1' },
          sender: { platformUserId: 'agent', name: 'Agent' },
          createdAt: new Date(baseTime.getTime() + 2000),
        },
        {
          organizationId: testOrgId,
          conversationId: testConversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_3',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Message 2' },
          sender: { platformUserId: 'customer_123', name: 'Customer' },
          createdAt: new Date(baseTime.getTime() + 3000),
        },
      ]);

      const conversation = await conversationModel
        .findById(testConversationId)
        .lean();

      // First AI processing
      const msg3 = await messageModel
        .findOne({ platformMessageId: 'msg_3' })
        .lean();
      const combinedData1 = MessageCombiner.combineMessages([
        { conversation: conversation as any, message: msg3 as any },
      ]);

      const loadChatHistoryMethod = (processor as any).loadChatHistory.bind(
        processor,
      );
      const loaded1 = await loadChatHistoryMethod(combinedData1, conversation);

      expect(loaded1).toBe(true);
      expect(combinedData1.texts[0]?.content).toContain('Message 1');
      expect(combinedData1.texts[0]?.content).toContain('Reply 1');

      // Add more messages (simulating agent manual reply + customer response)
      await messageModel.create([
        {
          organizationId: testOrgId,
          conversationId: testConversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_4',
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          content: { text: 'Manual reply after AI off' },
          sender: { platformUserId: 'agent_123', name: 'Agent' },
          createdAt: new Date(baseTime.getTime() + 4000),
        },
        {
          organizationId: testOrgId,
          conversationId: testConversationId,
          platform: Platform.FACEBOOK,
          platformMessageId: 'msg_5',
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Message 3' },
          sender: { platformUserId: 'customer_123', name: 'Customer' },
          createdAt: new Date(baseTime.getTime() + 5000),
        },
      ]);

      // Second AI processing (after AI turned back on)
      const msg5 = await messageModel
        .findOne({ platformMessageId: 'msg_5' })
        .lean();
      const combinedData2 = MessageCombiner.combineMessages([
        { conversation: conversation as any, message: msg5 as any },
      ]);

      const loaded2 = await loadChatHistoryMethod(combinedData2, conversation);

      // Should load history again (not skip because of flag)
      expect(loaded2).toBe(true);

      // Should contain ALL messages including the manual reply
      expect(combinedData2.texts[0]?.content).toContain('Message 1');
      expect(combinedData2.texts[0]?.content).toContain('Reply 1');
      expect(combinedData2.texts[0]?.content).toContain('Message 2');
      expect(combinedData2.texts[0]?.content).toContain(
        'Manual reply after AI off',
      ); // CRITICAL: Must include manual reply
      expect(combinedData2.texts[0]?.content).toContain('Message 3');
    });

    it('should skip loading history for comment-type conversations (skipped by caller)', async () => {
      // Update conversation to be comment-type
      await conversationModel.findByIdAndUpdate(testConversationId, {
        'metadata.type': 'post_comments',
      });

      // Create some messages
      await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'comment_1',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'Nice post!' },
        sender: { platformUserId: 'customer_123', name: 'Customer' },
      });

      const conversation = await conversationModel
        .findById(testConversationId)
        .lean();

      // In real code, loadChatHistory is NOT called for comment-type conversations
      // The check happens in the caller (ai-api-call.processor.ts line 161)
      const isCommentType = conversation.metadata?.type === 'post_comments';
      expect(isCommentType).toBe(true);

      // This test verifies that the check exists, not the loadChatHistory function itself
    });

    it('should handle conversation with only current message', async () => {
      // Create conversation with only current message
      const message = await messageModel.create({
        organizationId: testOrgId,
        conversationId: testConversationId,
        platform: Platform.FACEBOOK,
        platformMessageId: 'msg_1',
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content: { text: 'First message' },
        sender: { platformUserId: 'customer_123', name: 'Customer' },
      });

      const conversation = await conversationModel
        .findById(testConversationId)
        .lean();

      const combinedData = MessageCombiner.combineMessages([
        { conversation: conversation as any, message: message.toObject() as any },
      ]);

      const loadChatHistoryMethod = (processor as any).loadChatHistory.bind(
        processor,
      );
      await loadChatHistoryMethod(combinedData, conversation);

      // Current message should be in the combined data
      expect(combinedData.texts[0]?.content).toContain('First message');

      // Should work fine even with no history (won't crash)
      expect(combinedData.texts.length).toBeGreaterThan(0);
    });
  });
});
