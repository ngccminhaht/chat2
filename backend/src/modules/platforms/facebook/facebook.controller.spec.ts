import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { WebhookPublisherService } from '@/modules/webhooks/webhook-publisher.service';
import { OAuthStateService } from '@/modules/connections/oauth-state.service';
import { EnvService } from '@/common/env';

describe('FacebookController', () => {
  let controller: FacebookController;
  let facebookService: jest.Mocked<FacebookService>;
  let webhookPublisher: jest.Mocked<WebhookPublisherService>;
  let envService: jest.Mocked<EnvService>;
  let oauthStateService: jest.Mocked<OAuthStateService>;

  const mockFacebookService = {
    verifySignature: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    getPages: jest.fn(),
    savePlatformConnection: jest.fn(),
    syncConversations: jest.fn(),
    getSyncStatus: jest.fn(),
    syncPagesForUser: jest.fn(),
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
      controllers: [FacebookController],
      providers: [
        { provide: FacebookService, useValue: mockFacebookService },
        { provide: WebhookPublisherService, useValue: mockWebhookPublisher },
        { provide: EnvService, useValue: mockEnvService },
        { provide: OAuthStateService, useValue: mockOAuthStateService },
      ],
    }).compile();

    controller = module.get<FacebookController>(FacebookController);
    facebookService = module.get(FacebookService);
    webhookPublisher = module.get(WebhookPublisherService);
    envService = module.get(EnvService);
    oauthStateService = module.get(OAuthStateService);

    jest.clearAllMocks();
  });

  describe('verifyWebhook', () => {
    it('should return challenge when verification is valid', async () => {
      mockEnvService.get.mockReturnValue('test-verify-token');

      const result = await controller.verifyWebhook(
        'subscribe',
        'test-challenge',
        'test-verify-token',
      );

      expect(result).toBe('test-challenge');
    });

    it('should throw BadRequestException when verify token is not configured', async () => {
      mockEnvService.get.mockReturnValue(undefined);

      await expect(
        controller.verifyWebhook('subscribe', 'test-challenge', 'test-token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when mode is not subscribe', async () => {
      mockEnvService.get.mockReturnValue('test-verify-token');

      await expect(
        controller.verifyWebhook('invalid', 'test-challenge', 'test-verify-token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when token does not match', async () => {
      mockEnvService.get.mockReturnValue('test-verify-token');

      await expect(
        controller.verifyWebhook('subscribe', 'test-challenge', 'wrong-token'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleWebhook', () => {
    const mockPayload = {
      object: 'page',
      entry: [
        {
          id: 'page123',
          messaging: [{ sender: { id: 'user1' }, message: { text: 'Hello' } }],
        },
      ],
    };

    const mockRequest = {
      rawBody: Buffer.from(JSON.stringify(mockPayload)),
    } as any;

    it('should process webhook and return success', async () => {
      mockEnvService.get.mockReturnValue('app-secret');
      mockFacebookService.verifySignature.mockReturnValue(true);
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockRequest,
        mockPayload as any,
        'sha256=signature',
      );

      expect(result).toEqual({ success: true });
      expect(mockWebhookPublisher.publishWebhookEvent).toHaveBeenCalledWith(
        'facebook',
        mockPayload,
        'sha256=signature',
      );
    });

    it('should handle webhook without signature', async () => {
      mockWebhookPublisher.publishWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        mockRequest,
        mockPayload as any,
        undefined as any,
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('getAuthUrl', () => {
    it('should return auth URL and state', async () => {
      const mockReq = { user: { userId: 'user123' } };
      mockFacebookService.getAuthorizationUrl.mockReturnValue({
        url: 'https://facebook.com/oauth',
        state: 'state123',
      });
      mockOAuthStateService.storeState.mockResolvedValue(undefined);

      const result = await controller.getAuthUrl({ state: 'custom-state' }, mockReq);

      expect(result).toEqual({
        authUrl: 'https://facebook.com/oauth',
        state: 'state123',
      });
      expect(mockOAuthStateService.storeState).toHaveBeenCalled();
    });
  });

  describe('completeOAuth', () => {
    const mockReq = { user: { userId: 'user123' } };

    it('should complete OAuth and return connections', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue({
        state: 'state123',
        userId: 'user123',
        createdAt: Date.now(),
      });
      mockFacebookService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'token123',
      });
      mockFacebookService.getPages.mockResolvedValue([
        { id: 'page1', name: 'Page 1', access_token: 'page-token' },
      ]);
      mockFacebookService.savePlatformConnection.mockResolvedValue({
        _id: 'conn1',
        platform: 'facebook',
        platformAccountName: 'Page 1',
        status: 'active',
      });
      mockFacebookService.syncConversations.mockResolvedValue(undefined);

      const result = await controller.completeOAuth(
        { code: 'code123', state: 'state123' },
        mockReq,
      );

      expect(result.success).toBe(true);
      expect(result.connections).toHaveLength(1);
    });

    it('should throw BadRequestException when state not found', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue(null);

      await expect(
        controller.completeOAuth({ code: 'code123', state: 'invalid' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no pages found', async () => {
      mockOAuthStateService.getAndDeleteState.mockResolvedValue({
        state: 'state123',
        userId: 'user123',
        createdAt: Date.now(),
      });
      mockFacebookService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'token123',
      });
      mockFacebookService.getPages.mockResolvedValue([]);

      await expect(
        controller.completeOAuth({ code: 'code123', state: 'state123' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status for user', async () => {
      const mockReq = { user: { userId: 'user123' } };
      mockFacebookService.getSyncStatus.mockResolvedValue({
        connectedPages: 2,
        lastSyncAt: new Date(),
      });

      const result = await controller.getSyncStatus(mockReq);

      expect(result.success).toBe(true);
      expect(result.connectedPages).toBe(2);
    });
  });
});
