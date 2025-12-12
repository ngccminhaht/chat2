import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

describe('MessagesController', () => {
  let controller: MessagesController;
  let messagesService: jest.Mocked<MessagesService>;

  const mockMessagesService = {
    findByConversation: jest.fn(),
    send: jest.fn(),
    markAsRead: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [{ provide: MessagesService, useValue: mockMessagesService }],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
    messagesService = module.get(MessagesService);

    jest.clearAllMocks();
  });

  describe('findByConversation', () => {
    it('should return messages for a conversation', async () => {
      const conversationId = 'conv123';
      const dto = { limit: 20, before: undefined };
      const mockMessages = [
        { _id: 'msg1', content: { text: 'Hello' } },
        { _id: 'msg2', content: { text: 'Hi' } },
      ];

      mockMessagesService.findByConversation.mockResolvedValue(mockMessages);

      const result = await controller.findByConversation(conversationId, dto);

      expect(result).toEqual(mockMessages);
      expect(mockMessagesService.findByConversation).toHaveBeenCalledWith(
        conversationId,
        dto,
      );
    });

    it('should handle pagination parameters', async () => {
      const conversationId = 'conv123';
      const dto = { limit: 10, before: 'msg10' };

      mockMessagesService.findByConversation.mockResolvedValue([]);

      await controller.findByConversation(conversationId, dto);

      expect(mockMessagesService.findByConversation).toHaveBeenCalledWith(
        conversationId,
        dto,
      );
    });
  });

  describe('send', () => {
    const mockReq = { user: { userId: 'user123' } };
    const sendDto = {
      conversationId: 'conv123',
      type: 'text',
      content: { text: 'Hello' },
    };

    it('should send message and return result', async () => {
      const mockMessage = {
        _id: 'msg1',
        conversationId: 'conv123',
        content: { text: 'Hello' },
        status: 'pending',
      };

      mockMessagesService.send.mockResolvedValue(mockMessage);

      const result = await controller.send(mockReq, sendDto);

      expect(result).toEqual(mockMessage);
      expect(mockMessagesService.send).toHaveBeenCalledWith('user123', sendDto);
    });
  });

  describe('markAsRead', () => {
    const mockReq = { user: { userId: 'user123' } };
    const markReadDto = { conversationId: 'conv123' };

    it('should mark messages as read', async () => {
      const mockResult = { modifiedCount: 5 };

      mockMessagesService.markAsRead.mockResolvedValue(mockResult);

      const result = await controller.markAsRead(mockReq, markReadDto);

      expect(result).toEqual(mockResult);
      expect(mockMessagesService.markAsRead).toHaveBeenCalledWith(
        'conv123',
        'user123',
      );
    });
  });
});
