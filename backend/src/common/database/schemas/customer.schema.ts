import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform } from '@/common/constants';

export type CustomerDocument = Customer & Document;

/**
 * Device metadata collected from widget
 */
@Schema({ _id: false })
export class DeviceInfo {
  @Prop()
  browser?: string;

  @Prop()
  browserVersion?: string;

  @Prop()
  os?: string;

  @Prop()
  osVersion?: string;

  @Prop()
  device?: string; // 'desktop' | 'mobile' | 'tablet'

  @Prop()
  screenWidth?: number;

  @Prop()
  screenHeight?: number;

  @Prop()
  language?: string;

  @Prop()
  timezone?: string;
}

/**
 * Location info from IP geolocation
 */
@Schema({ _id: false })
export class LocationInfo {
  @Prop()
  country?: string;

  @Prop()
  countryCode?: string;

  @Prop()
  city?: string;

  @Prop()
  region?: string;
}

/**
 * Customer - unified profile for visitors across platforms
 * A customer can have multiple platform identities (widget, Facebook, Zalo, etc.)
 */
@Schema({ timestamps: true })
export class Customer {
  // Multi-tenant: Organization reference
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  // Contact info (from pre-chat form or platform)
  @Prop()
  name?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  avatar?: string;

  // Platform identities - allows linking same customer across channels
  @Prop({
    type: [
      {
        platform: { type: String, enum: Object.values(Platform) },
        platformUserId: String,
        displayName: String,
        avatar: String,
      },
    ],
    default: [],
  })
  platformIdentities: {
    platform: Platform;
    platformUserId: string;
    displayName?: string;
    avatar?: string;
  }[];

  // Widget-specific: session tracking
  @Prop()
  widgetSessionId?: string;

  // Source tracking
  @Prop()
  firstSeenDomain?: string;

  @Prop()
  lastSeenDomain?: string;

  @Prop({ type: [String], default: [] })
  domains: string[]; // All domains where customer was seen

  @Prop()
  referrer?: string;

  @Prop()
  landingPage?: string;

  // Device info
  @Prop({ type: DeviceInfo })
  deviceInfo?: DeviceInfo;

  // Location info (from IP)
  @Prop({ type: LocationInfo })
  location?: LocationInfo;

  @Prop()
  ipAddress?: string;

  // Engagement metrics
  @Prop({ default: 0 })
  totalConversations: number;

  @Prop({ default: 0 })
  totalMessages: number;

  @Prop()
  firstSeenAt?: Date;

  @Prop()
  lastSeenAt?: Date;

  @Prop()
  lastContactedAt?: Date;

  // Tags for segmentation
  @Prop({ type: [String], default: [] })
  tags: string[];

  // Custom fields (flexible)
  @Prop({ type: Object, default: {} })
  customFields: Record<string, any>;

  // Notes from agents
  @Prop()
  notes?: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

// Indexes
CustomerSchema.index({ organizationId: 1, email: 1 });
CustomerSchema.index({ organizationId: 1, phone: 1 });
CustomerSchema.index({ organizationId: 1, widgetSessionId: 1 });
CustomerSchema.index({ organizationId: 1, 'platformIdentities.platform': 1, 'platformIdentities.platformUserId': 1 });
CustomerSchema.index({ organizationId: 1, lastSeenAt: -1 });
CustomerSchema.index({ organizationId: 1, createdAt: -1 });
CustomerSchema.index({ organizationId: 1, name: 'text', email: 'text' }); // Text search
