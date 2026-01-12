import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type ConversationNoteDocument = ConversationNote & Document;

/**
 * ConversationNote - Internal notes for conversations
 * Allows agents to add private or shared notes on conversations
 */
@Schema({ timestamps: true })
export class ConversationNote {
  // Multi-tenant: Organization reference (required for all queries)
  @Prop({
    type: Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  // Conversation reference
  @Prop({
    type: Types.ObjectId,
    ref: "Conversation",
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  // User who created the note
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  // Note content
  @Prop({ required: true, type: String })
  content: string;

  // Private note - only visible to creator and admins
  @Prop({ type: Boolean, default: false })
  isPrivate: boolean;

  // Optional metadata
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ConversationNoteSchema =
  SchemaFactory.createForClass(ConversationNote);

// Indexes
ConversationNoteSchema.index({
  organizationId: 1,
  conversationId: 1,
  createdAt: -1,
}); // Main query: notes by conversation
ConversationNoteSchema.index({ organizationId: 1, userId: 1 }); // User's notes
ConversationNoteSchema.index({ conversationId: 1 }); // Conversation notes (for deletion cleanup)
