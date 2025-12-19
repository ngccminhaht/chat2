import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ZaloController } from './zalo.controller';
import { ZaloService } from './zalo.service';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';
import { OAuthStateService } from '@/modules/connections/oauth-state.service';
import { EnvService } from '@/common/env';

describe('ZaloController', () => {
  let controller: ZaloController;
  let zaloService: jest.Mocked<ZaloService>;
  let webhookPublisher: jest.Mocked<WebhookPublisherService>;
  let envService: jest.Mocked<EnvService>;
  let oauthStateService: jest.Mocked<OAuthStateService>;

  const mockZaloService = {
    verifySignature: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    getOAInfo: jest.fn(),
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
      controllers: [ZaloController],
      providers: [
        { provide: ZaloService, useValue: mockZaloService },
        { provide: WebhookPublisherService, useValue: mockWebhookPublisher },
        { provide: EnvService, useValue: mockEnvService },
        { provide: OAuthStateService, useValue: mockOAuthStateService },
      ],
    }).compile();

    controller = module.get<ZaloController>(ZaloController);
    zaloService = module.get(ZaloService);
    webhookPublisher = module.get(WebhookPublisherService);
    envService = module.get(EnvService);
    oauthStateService = module.get(OAuthStateService);

    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const mockPayload = {
      event_name: 'user_send_text',
      sender: { id: 'sender123' },
      recipient: { id: 'oa123' },
      message: { text: 'Hello' },
    };

    it('should process webhook and return success', async () => {
      mockEnvService.get.mockReturnValue('app-secret');
      mockZaloService.verifySignature.mockReturnValue(true);
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockPayload as any,
        'signature123',
      );

      expect(result).toEqual({ success: true });
      expect(mockWebhookPublisher.publishWebhookEvent).toHaveBeenCalledWith(
        'zalo',
        mockPayload,
        'signature123',
      );
    });

    it('should handle webhook without signature', async () => {
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockPayload as any,
        undefined as any,
      );

      expect(result).toEqual({ success: true });
    });

    it('should log warning when signature is invalid', async () => {
      mockEnvService.get.mockReturnValue('app-secret');
      mockZaloService.verifySignature.mockReturnValue(false);
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockPayload as any,
        'invalid-signature',
      );

      expect(result).toEqual({ success: true });
      expect(mockZaloService.verifySignature).toHaveBeenCalled();
    });
  });

  describe('getAuthUrl', () => {
    it('should return auth URL and state', async () => {
      const mockReq = { user: { userId: 'user123' } };
      mockZaloService.getAuthorizationUrl.mockReturnValue({
        url: 'https://oauth.zaloapp.com/v4/oa/permission',
        codeVerifier: 'verifier123',
        state: 'state123',
      });
      mockOAuthStateService.storeState.mockResolvedValue(undefined);

      const result = await controller.getAuthUrl({ state: 'custom-state', organizationId: 'org123' }, mockReq);

      expect(result).toEqual({
        authUrl: 'https://oauth.zaloapp.com/v4/oa/permission',
        state: 'state123',
      });
      expect(mockOAuthStateService.storeState).toHaveBeenCalledWith(
        'state123',
        expect.objectContaining({
          state: 'state123',
          userId: 'user123',
          codeVerifier: 'verifier123',
        }),
      );
    });
  });

  describe('completeOAuth', () => {
    const mockReq = { user: { userId: 'user123' } };

    it('should complete OAuth and return connection', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue({
        state: 'state123',
        userId: 'user123',
        organizationId: 'org123',
        codeVerifier: 'verifier123',
        createdAt: Date.now(),
      });
      mockZaloService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'token123',
        refresh_token: 'refresh123',
      });
      mockZaloService.getOAInfo.mockResolvedValue({
        oa_id: 'oa123',
        name: 'Test OA',
      });
      mockZaloService.savePlatformConnection.mockResolvedValue({
        _id: 'conn1',
        platform: 'zalo',
        platformAccountName: 'Test OA',
        status: 'active',
      });
      mockZaloService.syncConversations.mockResolvedValue(undefined);

      const result = await controller.completeOAuth(
        { code: 'code123', state: 'state123', oa_id: 'oa123' },
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.connection.platform).toBe('zalo');
    });

    it('should throw BadRequestException when state not found', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue(null);

      await expect(
        controller.completeOAuth(
          { code: 'code123', state: 'invalid', oa_id: 'oa123' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
