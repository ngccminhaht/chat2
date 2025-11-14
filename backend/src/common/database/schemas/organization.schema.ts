import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  settings: {
    timezone?: string;
    workingHours?: {
      start: string;
      end: string;
    };
    autoAssignment?: boolean;
  };

  @Prop({ default: true })
  isActive: boolean;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
