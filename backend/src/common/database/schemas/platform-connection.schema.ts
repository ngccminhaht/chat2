import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlatformConnectionDocument = PlatformConnection & Document;

@Schema({ timestamps: true })
export class PlatformConnection {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['facebook', 'zalo', 'tiktok', 'shopee'],
  })
  platform: string;

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
    required: true,
    enum: ['active', 'expired', 'error'],
    default: 'active',
  })
  status: string;

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
