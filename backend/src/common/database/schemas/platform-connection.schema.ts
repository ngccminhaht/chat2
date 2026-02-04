import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, ConnectionStatus } from '@/common/constants';

export type PlatformConnectionDocument = PlatformConnection & Document;

// AI Agent settings for this connection/page
export interface ConnectionAISettings {
  enabled: boolean; // Enable/disable AI for this page
  apiKey?: string; // API key for MiAgent
  endpoint?: string; // API endpoint (default: https://api.miagent.io/v1/chat-messages)
  batchDelayMs?: number; // Delay before AI responds (default: 3000ms)
  maxImages?: number; // Maximum images per request (default: 3)
  autoUnseenTimeoutSeconds?: number; // [DEPRECATED] Not used anymore
}

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

  // AI Agent settings for this connection
  @Prop({ type: Object, default: { enabled: false } })
  aiSettings: ConnectionAISettings;
}

export const PlatformConnectionSchema = SchemaFactory.createForClass(PlatformConnection);

// Indexes - All queries MUST include organizationId for tenant isolation
PlatformConnectionSchema.index({ organizationId: 1, status: 1 }); // Org's connections

// GLOBAL unique constraint: One page can only be connected to ONE organization
// This prevents multiple organizations from connecting to the same page
PlatformConnectionSchema.index(
  { platform: 1, platformAccountId: 1 },
  { unique: true },
); // Unique globally (not per org)

PlatformConnectionSchema.index({ connectedBy: 1 }); // Audit trail
