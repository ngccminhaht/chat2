import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { Platform } from '@/common/constants';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let conversationsService: jest.Mocked<ConversationsService>;

  const mockConversationsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    removeAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: ConversationsService, useValue: mockConversationsService },
      ],
    }).compile();

    controller = module.get<ConversationsController>(ConversationsController);
    conversationsService = module.get(ConversationsService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all conversations', async () => {
      const dto = { platform: undefined, search: undefined };
      const mockConversations = [
        { _id: 'conv1', participant: { name: 'User 1' } },
        { _id: 'conv2', participant: { name: 'User 2' } },
      ];

      mockConversationsService.findAll.mockResolvedValue(mockConversations);

      const result = await controller.findAll(dto);

      expect(result).toEqual(mockConversations);
      expect(mockConversationsService.findAll).toHaveBeenCalledWith(dto);
    });

    it('should filter by platform', async () => {
      const dto = { platform: Platform.FACEBOOK, search: undefined };

      mockConversationsService.findAll.mockResolvedValue([]);

      await controller.findAll(dto);

      expect(mockConversationsService.findAll).toHaveBeenCalledWith(dto);
    });

    it('should search by keyword', async () => {
      const dto = { platform: undefined, search: 'test' };

      mockConversationsService.findAll.mockResolvedValue([]);

      await controller.findAll(dto);

      expect(mockConversationsService.findAll).toHaveBeenCalledWith(dto);
    });
  });

  describe('findOne', () => {
    it('should return a single conversation', async () => {
      const mockConversation = {
        _id: 'conv123',
        participant: { name: 'Test User' },
        lastMessage: { text: 'Hello' },
      };

      mockConversationsService.findOne.mockResolvedValue(mockConversation);

      const result = await controller.findOne('conv123');

      expect(result).toEqual(mockConversation);
      expect(mockConversationsService.findOne).toHaveBeenCalledWith('conv123');
    });
  });

  describe('remove', () => {
    it('should remove a conversation', async () => {
      mockConversationsService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove('conv123');

      expect(result).toEqual({ deleted: true });
      expect(mockConversationsService.remove).toHaveBeenCalledWith('conv123');
    });
  });

  describe('removeAll', () => {
    it('should remove all conversations', async () => {
      mockConversationsService.removeAll.mockResolvedValue({ deletedCount: 10 });

      const result = await controller.removeAll();

      expect(result).toEqual({ deletedCount: 10 });
      expect(mockConversationsService.removeAll).toHaveBeenCalled();
    });
  });
});
