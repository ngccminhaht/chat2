import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';
import { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';

export interface WidgetConfig {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  primaryColor: string;
  position: 'left' | 'right';
  greeting: string;
  logo?: string;
  offlineMessage: string;
  preChatForm: boolean;
  preChatFields: string[];
}

@Injectable()
export class WidgetService {
  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<OrganizationDocument>,
  ) {}

  private toWidgetConfig(org: OrganizationDocument): WidgetConfig {
    const settings = org.widgetSettings || {};
    return {
      organizationId: org._id.toString(),
      organizationName: org.name,
      organizationSlug: org.slug,
      primaryColor: settings.primaryColor || '#0066FF',
      position: settings.position || 'right',
      greeting: settings.greeting || 'Hi! How can we help you today?',
      logo: settings.logo,
      offlineMessage:
        settings.offlineMessage ||
        'We are currently offline. Leave a message and we will get back to you.',
      preChatForm: settings.preChatForm || false,
      preChatFields: settings.preChatFields || ['name', 'email'],
    };
  }

  async getWidgetConfig(orgSlug: string): Promise<WidgetConfig | null> {
    const org = await this.organizationModel
      .findOne({
        slug: orgSlug,
        isActive: true,
      })
      .exec();

    if (!org) {
      return null;
    }

    return this.toWidgetConfig(org);
  }

  async getWidgetConfigByOrgId(orgId: string): Promise<WidgetConfig | null> {
    const org = await this.organizationModel
      .findOne({
        _id: orgId,
        isActive: true,
      })
      .exec();

    if (!org) {
      return null;
    }

    return this.toWidgetConfig(org);
  }

  async updateWidgetConfig(
    orgId: string,
    dto: UpdateWidgetConfigDto,
  ): Promise<WidgetConfig> {
    const org = await this.organizationModel
      .findOneAndUpdate(
        { _id: orgId, isActive: true },
        {
          $set: {
            'widgetSettings.primaryColor': dto.primaryColor,
            'widgetSettings.position': dto.position,
            'widgetSettings.greeting': dto.greeting,
            'widgetSettings.logo': dto.logo,
            'widgetSettings.offlineMessage': dto.offlineMessage,
            'widgetSettings.preChatForm': dto.preChatForm,
            'widgetSettings.preChatFields': dto.preChatFields,
          },
        },
        { new: true },
      )
      .exec();

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return this.toWidgetConfig(org);
  }
}
