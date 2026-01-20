import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, MessageDirection, MessageType, MessageStatus } from '@/common/constants';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  // Multi-tenant: Organization reference (required for all queries)
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(Platform),
  })
  platform: Platform;

  @Prop({ required: true })
  platformMessageId: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MessageDirection),
  })
  direction: MessageDirection;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MessageType),
  })
  type: MessageType;

  @Prop({ type: Object, required: true })
  content: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    [key: string]: any; // Type-specific fields
  };

  @Prop({ type: Object, required: true })
  sender: {
    platformUserId: string;
    name: string;
    avatar?: string;
  };

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MessageStatus),
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  @Prop({ type: Object, default: {} })
  metadata: {
    rawPayload?: any;
    error?: string;
    [key: string]: any;
  };

  // AI batching: Track when message was sent to AI (null = not sent yet)
  @Prop({ type: Date, default: null })
  sentToAiAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes - All queries MUST include organizationId for tenant isolation
MessageSchema.index({ organizationId: 1, conversationId: 1, createdAt: -1 }); // Main query
MessageSchema.index(
  { organizationId: 1, platform: 1, platformMessageId: 1 },
  { unique: true },
); // Dedup per org
MessageSchema.index({ 'content.text': 'text' }); // Text search (global, filtered in app)

// Phase 2: Additional indexes from message-flow architecture
MessageSchema.index({ conversationId: 1, status: 1 }); // AI batching: pending messages per conversation
MessageSchema.index({ platformConnectionId: 1, createdAt: -1 }); // Platform connection queries
MessageSchema.index(
  { status: 1, createdAt: 1 },
  { partialFilterExpression: { status: 'PENDING' } },
); // Retry queue (partial - only PENDING messages)
MessageSchema.index(
  { conversationId: 1, sentToAiAt: 1, direction: 1 },
); // AI batching: unsent inbound messages per conversation
