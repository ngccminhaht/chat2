import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganizationMemberDocument = OrganizationMember & Document;

// Role within an organization (not global)
export enum OrganizationRole {
  OWNER = 'owner', // Full access, can delete org
  ADMIN = 'admin', // Manage members, settings
  AGENT = 'agent', // Handle conversations
  VIEWER = 'viewer', // Read-only access
}

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(OrganizationRole),
  })
  role: OrganizationRole;

  @Prop({ default: true })
  isActive: boolean;

  // Invitation tracking
  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId;

  @Prop()
  invitedAt?: Date;

  @Prop()
  joinedAt?: Date;
}

export const OrganizationMemberSchema =
  SchemaFactory.createForClass(OrganizationMember);

// Indexes
// Unique constraint: one membership per user per org
OrganizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
// Query user's organizations
OrganizationMemberSchema.index({ userId: 1, isActive: 1 });
// Query org's members
OrganizationMemberSchema.index({ organizationId: 1, isActive: 1 });
