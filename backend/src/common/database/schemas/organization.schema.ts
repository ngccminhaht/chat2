import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganizationDocument = Organization & Document;

// Subscription billing info (future-proof for Stripe/Polar integration)
export interface OrganizationSubscription {
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  externalId?: string; // Stripe/Polar subscription ID
}

// Organization settings
export interface OrganizationSettings {
  timezone?: string;
  businessHours?: {
    enabled: boolean;
    schedule?: Record<string, { start: string; end: string }>;
  };
  defaultLanguage?: string;
}

// Chat widget customization settings
export interface WidgetSettings {
  // Appearance
  buttonStyle?: 'circle' | 'pill' | 'square';
  buttonSize?: number;
  buttonIcon?: 'chat' | 'message' | 'messenger' | 'custom';
  customIconUrl?: string;
  position?: 'left' | 'right';
  marginRight?: number;
  marginBottom?: number;
  marginBottomMobile?: number;
  // Colors
  primaryColor?: string;
  textColor?: 'light' | 'dark';
  // Avatar
  avatarName?: string;
  avatarUrl?: string;
  // Window size
  windowHeightMobile?: number;
  windowHeight?: number;
  windowHeightUnit?: '%' | 'px';
  // Messages
  greeting?: string;
  offlineMessage?: string;
  // Pre-chat form
  preChatForm?: boolean;
  preChatFields?: string[]; // ['name', 'email', 'phone']
  // Legacy
  logo?: string;
}

export enum OrganizationPlan {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string; // URL-friendly identifier (e.g., "my-company")

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId;

  // Billing (future-proof)
  @Prop({
    type: String,
    enum: Object.values(OrganizationPlan),
    default: OrganizationPlan.FREE,
  })
  plan: OrganizationPlan;

  @Prop({ type: Object })
  subscription?: OrganizationSubscription;

  @Prop({ type: Object, default: {} })
  settings: OrganizationSettings;

  @Prop({ type: Object, default: {} })
  widgetSettings: WidgetSettings;

  @Prop({ default: true })
  isActive: boolean;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);

// Indexes
OrganizationSchema.index({ owner: 1 });
OrganizationSchema.index({ isActive: 1 });
