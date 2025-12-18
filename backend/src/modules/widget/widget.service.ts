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
  // Appearance
  buttonStyle: 'circle' | 'pill' | 'square';
  buttonSize: number;
  buttonIcon: 'chat' | 'message' | 'messenger' | 'custom';
  customIconUrl?: string;
  position: 'left' | 'right';
  marginRight: number;
  marginBottom: number;
  marginBottomMobile: number;
  // Colors
  primaryColor: string;
  textColor: 'light' | 'dark';
  // Avatar
  avatarName?: string;
  avatarUrl?: string;
  // Window size
  windowHeightMobile: number;
  windowHeight: number;
  windowHeightUnit: '%' | 'px';
  // Messages
  greeting: string;
  offlineMessage: string;
  // Pre-chat form
  preChatForm: boolean;
  preChatFields: string[];
  // Legacy
  logo?: string;
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
      // Appearance
      buttonStyle: settings.buttonStyle || 'circle',
      buttonSize: settings.buttonSize || 60,
      buttonIcon: settings.buttonIcon || 'chat',
      customIconUrl: settings.customIconUrl,
      position: settings.position || 'right',
      marginRight: settings.marginRight ?? 20,
      marginBottom: settings.marginBottom ?? 20,
      marginBottomMobile: settings.marginBottomMobile ?? 20,
      // Colors
      primaryColor: settings.primaryColor || '#0066FF',
      textColor: settings.textColor || 'light',
      // Avatar
      avatarName: settings.avatarName,
      avatarUrl: settings.avatarUrl,
      // Window size
      windowHeightMobile: settings.windowHeightMobile ?? 80,
      windowHeight: settings.windowHeight ?? 550,
      windowHeightUnit: settings.windowHeightUnit || 'px',
      // Messages
      greeting: settings.greeting || 'Hi! How can we help you today?',
      offlineMessage:
        settings.offlineMessage ||
        'We are currently offline. Leave a message and we will get back to you.',
      // Pre-chat form
      preChatForm: settings.preChatForm || false,
      preChatFields: settings.preChatFields || ['name', 'email'],
      // Legacy
      logo: settings.logo,
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
    // Build update object only for provided fields
    const updateFields: Record<string, unknown> = {};

    if (dto.buttonStyle !== undefined) updateFields['widgetSettings.buttonStyle'] = dto.buttonStyle;
    if (dto.buttonSize !== undefined) updateFields['widgetSettings.buttonSize'] = dto.buttonSize;
    if (dto.buttonIcon !== undefined) updateFields['widgetSettings.buttonIcon'] = dto.buttonIcon;
    if (dto.customIconUrl !== undefined) updateFields['widgetSettings.customIconUrl'] = dto.customIconUrl;
    if (dto.position !== undefined) updateFields['widgetSettings.position'] = dto.position;
    if (dto.marginRight !== undefined) updateFields['widgetSettings.marginRight'] = dto.marginRight;
    if (dto.marginBottom !== undefined) updateFields['widgetSettings.marginBottom'] = dto.marginBottom;
    if (dto.marginBottomMobile !== undefined) updateFields['widgetSettings.marginBottomMobile'] = dto.marginBottomMobile;
    if (dto.primaryColor !== undefined) updateFields['widgetSettings.primaryColor'] = dto.primaryColor;
    if (dto.textColor !== undefined) updateFields['widgetSettings.textColor'] = dto.textColor;
    if (dto.avatarName !== undefined) updateFields['widgetSettings.avatarName'] = dto.avatarName;
    if (dto.avatarUrl !== undefined) updateFields['widgetSettings.avatarUrl'] = dto.avatarUrl;
    if (dto.windowHeightMobile !== undefined) updateFields['widgetSettings.windowHeightMobile'] = dto.windowHeightMobile;
    if (dto.windowHeight !== undefined) updateFields['widgetSettings.windowHeight'] = dto.windowHeight;
    if (dto.windowHeightUnit !== undefined) updateFields['widgetSettings.windowHeightUnit'] = dto.windowHeightUnit;
    if (dto.greeting !== undefined) updateFields['widgetSettings.greeting'] = dto.greeting;
    if (dto.offlineMessage !== undefined) updateFields['widgetSettings.offlineMessage'] = dto.offlineMessage;
    if (dto.preChatForm !== undefined) updateFields['widgetSettings.preChatForm'] = dto.preChatForm;
    if (dto.preChatFields !== undefined) updateFields['widgetSettings.preChatFields'] = dto.preChatFields;
    if (dto.logo !== undefined) updateFields['widgetSettings.logo'] = dto.logo;

    const org = await this.organizationModel
      .findOneAndUpdate(
        { _id: orgId, isActive: true },
        { $set: updateFields },
        { new: true },
      )
      .exec();

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return this.toWidgetConfig(org);
  }
}
