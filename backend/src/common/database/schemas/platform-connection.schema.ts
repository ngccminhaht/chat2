import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, ConnectionStatus } from '@/common/constants';

export type PlatformConnectionDocument = PlatformConnection & Document;

@Schema({ timestamps: true })
export class PlatformConnection {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

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

// Indexes
PlatformConnectionSchema.index({ userId: 1 });
PlatformConnectionSchema.index({ platform: 1, platformAccountId: 1 }, { unique: true });
