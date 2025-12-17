import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AiAgentDocument = AiAgent & Document;

export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
  CUSTOM = 'custom', // For external AI platform
}

export enum AiAgentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
}

@Schema({ timestamps: true })
export class AiAgent {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string; // Display name, e.g., "Sales Assistant", "Support Bot"

  @Prop()
  description?: string;

  @Prop()
  avatar?: string; // Avatar URL for the AI agent

  @Prop({ type: String, enum: AiProvider, default: AiProvider.OPENAI })
  provider: AiProvider;

  @Prop({ required: true })
  model: string; // e.g., "gpt-4o-mini", "claude-3-haiku"

  @Prop({ type: String })
  systemPrompt?: string; // Instructions for the AI agent (optional for custom provider)

  @Prop()
  webhookUrl?: string; // External AI platform endpoint to receive messages

  @Prop()
  apiKey?: string; // API key for external AI platform (encrypted in production)

  @Prop({ type: [String], default: [] })
  knowledgeBase: string[]; // URLs or document IDs for context

  @Prop({ type: Object, default: {} })
  settings: {
    temperature?: number; // 0-1, default 0.7
    maxTokens?: number; // Max response length
    responseDelay?: number; // Delay in ms before responding (to seem human-like)
    workingHours?: { start: string; end: string }; // When AI is active
    handoffKeywords?: string[]; // Keywords to trigger human handoff
    greetingMessage?: string; // Auto-greeting for new conversations
  };

  @Prop({ type: String, enum: AiAgentStatus, default: AiAgentStatus.INACTIVE })
  status: AiAgentStatus;

  @Prop({ default: 0 })
  totalConversations: number;

  @Prop({ default: 0 })
  totalMessages: number;

  @Prop({ type: Date })
  lastActiveAt?: Date;
}

export const AiAgentSchema = SchemaFactory.createForClass(AiAgent);

// Index for efficient queries
AiAgentSchema.index({ organizationId: 1, status: 1 });
