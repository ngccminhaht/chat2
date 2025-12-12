import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionStatus } from '@/common/constants';

describe('ConnectionsController', () => {
  let controller: ConnectionsController;
  let connectionsService: jest.Mocked<ConnectionsService>;

  const mockConnectionsService = {
    findAllByUser: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [
        { provide: ConnectionsService, useValue: mockConnectionsService },
      ],
    }).compile();

    controller = module.get<ConnectionsController>(ConnectionsController);
    connectionsService = module.get(ConnectionsService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const mockReq = { user: { userId: 'user123' } };

    it('should return all connections for user', async () => {
      const mockConnections = [
        { _id: 'conn1', platform: 'facebook', platformAccountName: 'Page 1' },
        { _id: 'conn2', platform: 'zalo', platformAccountName: 'OA 1' },
      ];

      mockConnectionsService.findAllByUser.mockResolvedValue(mockConnections);

      const result = await controller.findAll(mockReq);

      expect(result).toEqual(mockConnections);
      expect(mockConnectionsService.findAllByUser).toHaveBeenCalledWith('user123');
    });
  });

  describe('findOne', () => {
    it('should return a single connection', async () => {
      const mockConnection = {
        _id: 'conn123',
        platform: 'facebook',
        platformAccountName: 'Test Page',
        status: 'active',
      };

      mockConnectionsService.findOne.mockResolvedValue(mockConnection);

      const result = await controller.findOne('conn123');

      expect(result).toEqual(mockConnection);
      expect(mockConnectionsService.findOne).toHaveBeenCalledWith('conn123');
    });
  });

  describe('updateStatus', () => {
    it('should update connection status', async () => {
      const mockConnection = {
        _id: 'conn123',
        platform: 'facebook',
        status: ConnectionStatus.INACTIVE,
      };

      mockConnectionsService.updateStatus.mockResolvedValue(mockConnection);

      const result = await controller.updateStatus('conn123', {
        status: ConnectionStatus.INACTIVE,
      });

      expect(result).toEqual({ success: true, connection: mockConnection });
      expect(mockConnectionsService.updateStatus).toHaveBeenCalledWith(
        'conn123',
        ConnectionStatus.INACTIVE,
      );
    });

    it('should throw BadRequestException when connection not found', async () => {
      mockConnectionsService.updateStatus.mockResolvedValue(null);

      await expect(
        controller.updateStatus('nonexistent', { status: ConnectionStatus.INACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete connection', async () => {
      mockConnectionsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('conn123');

      expect(result).toEqual({ success: true });
      expect(mockConnectionsService.delete).toHaveBeenCalledWith('conn123');
    });
  });
});
