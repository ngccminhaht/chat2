import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ShopeeController } from './shopee.controller';
import { ShopeeService } from './shopee.service';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';
import { OAuthStateService } from '@/modules/connections/oauth-state.service';
import { EnvService } from '@/common/env';

describe('ShopeeController', () => {
  let controller: ShopeeController;
  let shopeeService: jest.Mocked<ShopeeService>;
  let webhookPublisher: jest.Mocked<WebhookPublisherService>;
  let envService: jest.Mocked<EnvService>;
  let oauthStateService: jest.Mocked<OAuthStateService>;

  const mockShopeeService = {
    verifySignature: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    getShopInfo: jest.fn(),
    savePlatformConnection: jest.fn(),
    syncConversations: jest.fn(),
  };

  const mockWebhookPublisher = {
    publishWebhookEvent: jest.fn(),
  };

  const mockEnvService = {
    get: jest.fn(),
  };

  const mockOAuthStateService = {
    storeState: jest.fn(),
    getAndDeleteState: jest.fn(),
    getState: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopeeController],
      providers: [
        { provide: ShopeeService, useValue: mockShopeeService },
        { provide: WebhookPublisherService, useValue: mockWebhookPublisher },
        { provide: EnvService, useValue: mockEnvService },
        { provide: OAuthStateService, useValue: mockOAuthStateService },
      ],
    }).compile();

    controller = module.get<ShopeeController>(ShopeeController);
    shopeeService = module.get(ShopeeService);
    webhookPublisher = module.get(WebhookPublisherService);
    envService = module.get(EnvService);
    oauthStateService = module.get(OAuthStateService);

    jest.clearAllMocks();
  });

  describe('verifyWebhook', () => {
    it('should return success response for verification', async () => {
      const result = await controller.verifyWebhook();

      expect(result).toEqual({ code: 0, message: 'success' });
    });
  });

  describe('handleWebhook', () => {
    const mockPayload = {
      shop_id: 12345,
      data: {
        message_type: 'text',
        content: { text: 'Hello' },
      },
    };

    const mockRequest = {
      rawBody: Buffer.from(JSON.stringify(mockPayload)),
      protocol: 'https',
      get: jest.fn().mockReturnValue('api.example.com'),
      originalUrl: '/api/shopee/webhook',
    } as any;

    it('should process webhook and return success', async () => {
      mockEnvService.get.mockReturnValue('partner-key');
      mockShopeeService.verifySignature.mockReturnValue(true);
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockRequest,
        mockPayload as any,
        'auth-signature',
      );

      expect(result).toEqual({ code: 0, message: 'success' });
      expect(mockWebhookPublisher.publishWebhookEvent).toHaveBeenCalledWith(
        'shopee',
        mockPayload,
        'auth-signature',
      );
    });

    it('should handle verification message', async () => {
      const verifyPayload = {
        shop_id: 12345,
        data: {
          verify_info: { code: 'verify123' },
        },
      };

      const result = await controller.handleWebhook(
        mockRequest,
        verifyPayload as any,
        'auth-signature',
      );

      expect(result).toEqual({ code: 0, message: 'success' });
      expect(mockWebhookPublisher.publishWebhookEvent).not.toHaveBeenCalled();
    });

    it('should return error when signature is invalid', async () => {
      mockEnvService.get.mockReturnValue('partner-key');
      mockShopeeService.verifySignature.mockReturnValue(false);

      const result = await controller.handleWebhook(
        mockRequest,
        mockPayload as any,
        'invalid-auth',
      );

      expect(result).toEqual({ code: 1, message: 'Invalid signature' });
    });
  });

  describe('getAuthUrl', () => {
    it('should return auth URL and state', async () => {
      const mockReq = { user: { userId: 'user123' } };
      mockShopeeService.getAuthorizationUrl.mockReturnValue({
        url: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
        state: 'state123',
      });
      mockOAuthStateService.storeState.mockResolvedValue(undefined);

      const result = await controller.getAuthUrl({ state: 'custom-state', organizationId: 'org123' }, mockReq);

      expect(result).toEqual({
        authUrl: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
        state: 'state123',
      });
      expect(mockOAuthStateService.storeState).toHaveBeenCalled();
    });
  });

  describe('completeOAuth', () => {
    const mockReq = { user: { userId: 'user123' } };

    it('should complete OAuth and return connection', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue({
        state: 'state123',
        userId: 'user123',
        organizationId: 'org123',
        createdAt: Date.now(),
      });
      mockShopeeService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'token123',
        refresh_token: 'refresh123',
      });
      mockShopeeService.getShopInfo.mockResolvedValue({
        shop_id: 12345,
        shop_name: 'Test Shop',
      });
      mockShopeeService.savePlatformConnection.mockResolvedValue({
        _id: 'conn1',
        platform: 'shopee',
        platformAccountName: 'Test Shop',
        status: 'active',
      });
      mockShopeeService.syncConversations.mockResolvedValue(undefined);

      const result = await controller.completeOAuth(
        { code: 'code123', state: 'state123', shop_id: '12345' },
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.connection.platform).toBe('shopee');
    });

    it('should throw BadRequestException when state not found', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue(null);

      await expect(
        controller.completeOAuth(
          { code: 'code123', state: 'invalid', shop_id: '12345' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
