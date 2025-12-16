import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WidgetService } from './widget.service';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';

describe('WidgetService', () => {
  let service: WidgetService;
  let organizationModel: jest.Mocked<Model<OrganizationDocument>>;

  const mockOrganization = {
    _id: { toString: () => 'org123' },
    name: 'Test Company',
    slug: 'test-company',
    isActive: true,
    widgetSettings: {
      primaryColor: '#FF0000',
      position: 'left' as const,
      greeting: 'Custom greeting',
      logo: 'https://example.com/logo.png',
      offlineMessage: 'Custom offline message',
      preChatForm: true,
      preChatFields: ['name', 'email', 'phone'],
    },
  };

  beforeEach(async () => {
    const mockModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetService,
        { provide: getModelToken(Organization.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<WidgetService>(WidgetService);
    organizationModel = module.get(getModelToken(Organization.name));
  });

  describe('getWidgetConfig', () => {
    it('should return widget config for existing org', async () => {
      (organizationModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockOrganization),
      });

      const result = await service.getWidgetConfig('test-company');

      expect(result).not.toBeNull();
      expect(result!.organizationId).toBe('org123');
      expect(result!.organizationName).toBe('Test Company');
      expect(result!.primaryColor).toBe('#FF0000');
      expect(result!.position).toBe('left');
      expect(result!.greeting).toBe('Custom greeting');
      expect(result!.logo).toBe('https://example.com/logo.png');
      expect(result!.offlineMessage).toBe('Custom offline message');
      expect(result!.preChatForm).toBe(true);
      expect(result!.preChatFields).toEqual(['name', 'email', 'phone']);
    });

    it('should return null for non-existent org', async () => {
      (organizationModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getWidgetConfig('non-existent');

      expect(result).toBeNull();
    });

    it('should query by slug and isActive', async () => {
      (organizationModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.getWidgetConfig('test-company');

      expect(organizationModel.findOne).toHaveBeenCalledWith({
        slug: 'test-company',
        isActive: true,
      });
    });

    it('should use default values when widgetSettings is empty', async () => {
      const orgWithoutSettings = {
        ...mockOrganization,
        widgetSettings: {},
      };

      (organizationModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(orgWithoutSettings),
      });

      const result = await service.getWidgetConfig('test-company');

      expect(result!.primaryColor).toBe('#0066FF');
      expect(result!.position).toBe('right');
      expect(result!.greeting).toBe('Hi! How can we help you today?');
      expect(result!.offlineMessage).toBe(
        'We are currently offline. Leave a message and we will get back to you.',
      );
      expect(result!.preChatForm).toBe(false);
      expect(result!.preChatFields).toEqual(['name', 'email']);
    });

    it('should use default values when widgetSettings is undefined', async () => {
      const orgWithoutSettings = {
        ...mockOrganization,
        widgetSettings: undefined,
      };

      (organizationModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(orgWithoutSettings),
      });

      const result = await service.getWidgetConfig('test-company');

      expect(result!.primaryColor).toBe('#0066FF');
      expect(result!.position).toBe('right');
    });
  });
});
