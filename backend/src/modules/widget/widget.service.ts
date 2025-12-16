import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from '@/common/database/schemas/organization.schema';

export interface WidgetConfig {
  organizationId: string;
  organizationName: string;
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

    const settings = org.widgetSettings || {};

    return {
      organizationId: org._id.toString(),
      organizationName: org.name,
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
}
