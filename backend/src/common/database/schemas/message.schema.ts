import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, MessageDirection, MessageType, MessageStatus } from '@/common/constants';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
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
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ platform: 1, platformMessageId: 1 }, { unique: true });
MessageSchema.index({ 'content.text': 'text' }); // Text search index
