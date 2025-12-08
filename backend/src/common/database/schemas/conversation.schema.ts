import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, ConversationStatus } from '@/common/constants';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({
    type: String,
    required: true,
    enum: Object.values(Platform),
  })
  platform: Platform;

  @Prop({ required: true })
  platformConversationId: string;

  @Prop({ type: Types.ObjectId, ref: 'PlatformConnection', required: true })
  platformConnectionId: Types.ObjectId;

  @Prop()
  platformAccountId?: string; // OA ID for Zalo, Page ID for Facebook, etc.

  // Customer information (denormalized for quick access)
  @Prop({ required: true })
  customerPlatformUserId: string;

  @Prop({ required: true })
  customerName: string;

  @Prop()
  customerAvatar?: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ConversationStatus),
    default: ConversationStatus.OPEN,
  })
  status: ConversationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object })
  lastMessage?: {
    text: string;
    timestamp: Date;
    senderId: string;
    messageId: Types.ObjectId;
  };

  @Prop({ default: 0 })
  unreadCount: number;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ status: 1, updatedAt: -1 });
ConversationSchema.index({ platformConnectionId: 1, platformConversationId: 1 }, { unique: true });
ConversationSchema.index({ assignedTo: 1 });
ConversationSchema.index({ platform: 1, platformAccountId: 1 }); // For querying by OA/Page ID
