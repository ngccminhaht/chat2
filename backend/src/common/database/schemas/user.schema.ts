import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

// User settings interface
export interface UserSettings {
  notifications?: boolean;
  language?: string;
  theme?: 'light' | 'dark' | 'system';
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  name: string;

  // Role removed - now per-organization in OrganizationMember

  @Prop()
  avatarUrl?: string;

  @Prop({ type: Object, default: {} })
  settings: UserSettings;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastActiveAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ isActive: 1 });
