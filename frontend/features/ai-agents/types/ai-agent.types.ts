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

export interface AiAgentSettings {
  temperature?: number;
  maxTokens?: number;
  responseDelay?: number;
  workingHours?: { start: string; end: string };
  handoffKeywords?: string[];
  greetingMessage?: string;
}

export interface AiAgent {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  avatar?: string;
  provider: AiProvider;
  model: string;
  systemPrompt?: string;
  webhookUrl?: string; // External AI platform endpoint
  apiKey?: string;
  knowledgeBase: string[];
  settings: AiAgentSettings;
  status: AiAgentStatus;
  totalConversations: number;
  totalMessages: number;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiAgentsResponse {
  data: AiAgent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateAiAgentDto {
  name: string;
  description?: string;
  avatar?: string;
  provider: AiProvider;
  model: string;
  systemPrompt?: string;
  webhookUrl?: string;
  apiKey?: string;
  knowledgeBase?: string[];
  settings?: AiAgentSettings;
}

export interface UpdateAiAgentDto {
  name?: string;
  description?: string;
  avatar?: string;
  provider?: AiProvider;
  model?: string;
  systemPrompt?: string;
  webhookUrl?: string;
  apiKey?: string;
  knowledgeBase?: string[];
  settings?: AiAgentSettings;
  status?: AiAgentStatus;
}
