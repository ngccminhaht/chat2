import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type QuickReplyDocument = QuickReply & Document;

@Schema({ timestamps: true })
export class QuickReply {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  userId?: MongooseSchema.Types.ObjectId; // null = shared across org, set = personal

  @Prop({ required: true })
  title: string; // Display name for the quick reply

  @Prop({ required: true })
  shortcut: string; // Trigger shortcut, e.g., "/hello", "/thanks"

  @Prop({ required: true })
  content: string; // The message content with optional variables like {customer_name}

  @Prop({ type: [String], default: [] })
  tags: string[]; // Categories for organization

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  usageCount: number; // Track how often this reply is used
}

export const QuickReplySchema = SchemaFactory.createForClass(QuickReply);

// Compound index for efficient lookup
QuickReplySchema.index({ organizationId: 1, shortcut: 1 });
QuickReplySchema.index({ organizationId: 1, userId: 1 });

// Text index for search
QuickReplySchema.index({ title: 'text', content: 'text', shortcut: 'text' });
