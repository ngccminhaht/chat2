import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);

    jest.clearAllMocks();
  });

  describe('getUser', () => {
    it('should return a user by id', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await controller.getUser('user123');

      expect(result).toEqual(mockUser);
      expect(mockUsersService.findById).toHaveBeenCalledWith('user123');
    });

    it('should return null when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      const result = await controller.getUser('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user and return updated data', async () => {
      const updateData = { name: 'Updated Name' };
      const mockUpdatedUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Updated Name',
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.updateUser('user123', updateData);

      expect(result).toEqual(mockUpdatedUser);
      expect(mockUsersService.update).toHaveBeenCalledWith('user123', updateData);
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      mockUsersService.delete.mockResolvedValue({ deleted: true });

      const result = await controller.deleteUser('user123');

      expect(result).toEqual({ deleted: true });
      expect(mockUsersService.delete).toHaveBeenCalledWith('user123');
    });
  });
});
