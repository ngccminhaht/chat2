import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['facebook', 'zalo', 'tiktok', 'shopee'],
  })
  platform: string;

  @Prop({ required: true })
  platformMessageId: string;

  @Prop({
    required: true,
    enum: ['inbound', 'outbound'],
  })
  direction: string;

  @Prop({
    required: true,
    enum: ['text', 'image', 'video', 'file', 'sticker', 'audio', 'location'],
  })
  type: string;

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
    required: true,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending',
  })
  status: string;

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
