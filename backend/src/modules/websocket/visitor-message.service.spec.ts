import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VisitorMessageService } from './visitor-message.service';
import { WebsocketGateway } from './websocket.gateway';
import {
  Conversation,
  ConversationDocument,
} from '@/common/database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '@/common/database/schemas/message.schema';
import { Platform, MessageDirection, MessageType, MessageStatus } from '@/common/constants';

describe('VisitorMessageService', () => {
  let service: VisitorMessageService;
  let conversationModel: jest.Mocked<Model<ConversationDocument>>;
  let messageModel: jest.Mocked<Model<MessageDocument>>;
  let websocketGateway: jest.Mocked<WebsocketGateway>;

  // Use valid 24-char hex strings for ObjectId
  const orgId = '507f1f77bcf86cd799439012';
  const mockConversation = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    organizationId: new Types.ObjectId(orgId),
    platform: Platform.WEB,
    platformConversationId: `web_${orgId}_session123`,
    customerName: 'Visitor',
    unreadCount: 0,
    assignedTo: new Types.ObjectId('507f1f77bcf86cd799439013'),
  };

  const mockMessage = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    conversationId: mockConversation._id,
    platform: Platform.WEB,
    direction: MessageDirection.INBOUND,
    type: MessageType.TEXT,
    content: { text: 'Hello' },
    createdAt: new Date(),
    toObject: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const mockConversationModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };

    const mockMessageModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn(),
          }),
        }),
      }),
      create: jest.fn(),
    };

    const mockWebsocketGateway = {
      emitNewMessage: jest.fn(),
      emitConversationUpdated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorMessageService,
        { provide: getModelToken(Conversation.name), useValue: mockConversationModel },
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
      ],
    }).compile();

    service = module.get<VisitorMessageService>(VisitorMessageService);
    conversationModel = module.get(getModelToken(Conversation.name));
    messageModel = module.get(getModelToken(Message.name));
    websocketGateway = module.get(WebsocketGateway);
  });

  describe('processVisitorMessage', () => {
    it('should create message and notify agent', async () => {
      conversationModel.findOne.mockResolvedValue(mockConversation);
      conversationModel.findByIdAndUpdate.mockResolvedValue(mockConversation);
      messageModel.create.mockResolvedValue(mockMessage as any);

      const result = await service.processVisitorMessage({
        sessionId: 'session123',
        organizationId: orgId,
        visitorName: 'John',
        text: 'Hello',
      });

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.WEB,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: { text: 'Hello', mediaUrl: undefined, fileName: undefined },
          sender: { platformUserId: 'session123', name: 'John' },
          status: MessageStatus.DELIVERED,
        }),
      );
      expect(result.conversationId).toEqual(mockConversation._id);
      expect(websocketGateway.emitNewMessage).toHaveBeenCalled();
    });

    it('should create new conversation if not exists', async () => {
      conversationModel.findOne.mockResolvedValue(null);
      conversationModel.create.mockResolvedValue(mockConversation as any);
      conversationModel.findByIdAndUpdate.mockResolvedValue(mockConversation);
      messageModel.create.mockResolvedValue(mockMessage as any);

      await service.processVisitorMessage({
        sessionId: 'session123',
        organizationId: orgId,
        text: 'Hello',
      });

      expect(conversationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.WEB,
          platformConversationId: `web_${orgId}_session123`,
        }),
      );
    });
  });

  describe('getExistingConversation', () => {
    it('should return null if conversation not found', async () => {
      conversationModel.findOne.mockResolvedValue(null);

      const result = await service.getExistingConversation(orgId, 'session123');

      expect(result).toBeNull();
    });

    it('should return conversation with messages if found', async () => {
      conversationModel.findOne.mockResolvedValue(mockConversation);
      const messages = [{ _id: 'msg1', text: 'Hello' }];
      messageModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(messages),
          }),
        }),
      } as any);

      const result = await service.getExistingConversation(orgId, 'session123');

      expect(result).toEqual({
        _id: mockConversation._id,
        messages: [{ _id: 'msg1', text: 'Hello' }],
      });
    });
  });

  describe('updateVisitorInfo', () => {
    it('should update visitor info in conversation', async () => {
      conversationModel.findOneAndUpdate.mockResolvedValue(mockConversation);

      await service.updateVisitorInfo(orgId, 'session123', {
        name: 'John',
        email: 'john@example.com',
        phone: '123456',
      });

      expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          platformConversationId: `web_${orgId}_session123`,
        }),
        expect.objectContaining({
          customerName: 'John',
          'metadata.visitorEmail': 'john@example.com',
          'metadata.visitorPhone': '123456',
        }),
      );
    });
  });

  describe('sendToVisitor', () => {
    it('should create outbound message and return sessionId', async () => {
      const webConversation = {
        ...mockConversation,
        platformConversationId: `web_${orgId}_session456`,
      };
      conversationModel.findById.mockResolvedValue(webConversation);
      conversationModel.findByIdAndUpdate.mockResolvedValue(webConversation);
      messageModel.create.mockResolvedValue(mockMessage as any);

      const result = await service.sendToVisitor(
        mockConversation._id.toString(),
        'agent123',
        'Agent Smith',
        { text: 'Reply message' },
      );

      expect(result.sessionId).toBe('session456');
      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: MessageDirection.OUTBOUND,
          sender: { platformUserId: 'agent123', name: 'Agent Smith' },
        }),
      );
    });

    it('should throw error if conversation not found', async () => {
      conversationModel.findById.mockResolvedValue(null);

      await expect(
        service.sendToVisitor('conv123', 'agent123', 'Agent', { text: 'Hi' }),
      ).rejects.toThrow('Conversation not found or not a web chat');
    });

    it('should throw error if not a web chat', async () => {
      conversationModel.findById.mockResolvedValue({
        ...mockConversation,
        platform: Platform.FACEBOOK,
      });

      await expect(
        service.sendToVisitor('conv123', 'agent123', 'Agent', { text: 'Hi' }),
      ).rejects.toThrow('Conversation not found or not a web chat');
    });
  });
});
