import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, ConnectionStatus } from '@/common/constants';

export type PlatformConnectionDocument = PlatformConnection & Document;

@Schema({ timestamps: true })
export class PlatformConnection {
  // Multi-tenant: Organization reference (required for all queries)
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  // User who connected (optional, for audit trail)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  connectedBy?: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(Platform),
  })
  platform: Platform;

  @Prop({ required: true })
  platformAccountId: string;

  @Prop({ required: true })
  platformAccountName: string;

  @Prop({ type: Object, required: true })
  credentials: {
    accessToken: string; // Should be encrypted in production
    refreshToken?: string;
    expiresAt?: Date;
    scopes?: string[];
  };

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ConnectionStatus),
    default: ConnectionStatus.ACTIVE,
  })
  status: ConnectionStatus;

  @Prop()
  webhookSecret: string;

  @Prop({ type: Object, default: {} })
  metadata: {
    pageId?: string; // Facebook
    oaId?: string; // Zalo
    shopId?: string; // TikTok/Shopee
    [key: string]: any; // Platform-specific fields
  };

  @Prop()
  lastSyncAt: Date;
}

export const PlatformConnectionSchema = SchemaFactory.createForClass(PlatformConnection);

// Indexes - All queries MUST include organizationId for tenant isolation
PlatformConnectionSchema.index({ organizationId: 1, status: 1 }); // Org's connections
PlatformConnectionSchema.index(
  { organizationId: 1, platform: 1, platformAccountId: 1 },
  { unique: true },
); // Unique per org
PlatformConnectionSchema.index({ connectedBy: 1 }); // Audit trail
