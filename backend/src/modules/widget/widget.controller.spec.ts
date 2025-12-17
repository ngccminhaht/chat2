import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WidgetController } from './widget.controller';
import { WidgetService, WidgetConfig } from './widget.service';

describe('WidgetController', () => {
  let controller: WidgetController;
  let widgetService: jest.Mocked<WidgetService>;

  const mockWidgetConfig: WidgetConfig = {
    organizationId: 'org123',
    organizationName: 'Test Company',
    organizationSlug: 'test-company',
    primaryColor: '#0066FF',
    position: 'right',
    greeting: 'Hello! How can we help?',
    logo: 'https://example.com/logo.png',
    offlineMessage: 'We are offline. Leave a message.',
    preChatForm: true,
    preChatFields: ['name', 'email'],
  };

  beforeEach(async () => {
    const mockWidgetService = {
      getWidgetConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetController],
      providers: [
        { provide: WidgetService, useValue: mockWidgetService },
      ],
    }).compile();

    controller = module.get<WidgetController>(WidgetController);
    widgetService = module.get(WidgetService);
  });

  describe('getWidgetConfig', () => {
    it('should return widget config for valid org slug', async () => {
      widgetService.getWidgetConfig.mockResolvedValue(mockWidgetConfig);

      const result = await controller.getWidgetConfig('test-company');

      expect(result).toEqual(mockWidgetConfig);
      expect(widgetService.getWidgetConfig).toHaveBeenCalledWith('test-company');
    });

    it('should throw NotFoundException for invalid org slug', async () => {
      widgetService.getWidgetConfig.mockResolvedValue(null);

      await expect(controller.getWidgetConfig('invalid-org')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include all required config fields', async () => {
      widgetService.getWidgetConfig.mockResolvedValue(mockWidgetConfig);

      const result = await controller.getWidgetConfig('test-company');

      expect(result).toHaveProperty('organizationId');
      expect(result).toHaveProperty('organizationName');
      expect(result).toHaveProperty('primaryColor');
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('greeting');
      expect(result).toHaveProperty('offlineMessage');
      expect(result).toHaveProperty('preChatForm');
      expect(result).toHaveProperty('preChatFields');
    });
  });
});
