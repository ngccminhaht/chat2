import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    refreshToken: jest.fn(),
    switchOrganization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);

    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('should return new tokens when refresh token is valid', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockAuthService.refreshToken.mockResolvedValue(mockResult);

      const result = await controller.refresh({ refreshToken });

      expect(result).toEqual(mockResult);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(refreshToken);
    });
  });

  describe('switchOrganization', () => {
    it('should switch active organization', async () => {
      const userId = 'user123';
      const organizationId = 'org456';
      const mockResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        organization: { id: organizationId, name: 'New Org' },
      };

      mockAuthService.switchOrganization.mockResolvedValue(mockResult);

      const result = await controller.switchOrganization(
        { sub: userId },
        { organizationId },
      );

      expect(result).toEqual(mockResult);
      expect(mockAuthService.switchOrganization).toHaveBeenCalledWith(
        userId,
        organizationId,
      );
    });
  });
});
