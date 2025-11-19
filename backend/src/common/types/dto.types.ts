/**
 * Data Transfer Objects (DTOs)
 * Type-safe DTOs for API requests/responses
 */

import {
  Platform,
  ConversationStatus,
  MessageStatus,
  MessageType,
  ConnectionStatus,
} from '../constants';

// ============================================================================
// Pagination
// ============================================================================

export interface PaginationDto {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// Organization DTOs
// ============================================================================

export interface CreateOrganizationDto {
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateOrganizationDto {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

// ============================================================================
// Conversation DTOs
// ============================================================================

export interface GetConversationsDto extends PaginationDto {
  status?: ConversationStatus;
  platform?: Platform;
  assignedTo?: string;
  search?: string;
  organizationId: string; // REQUIRED for multi-tenancy
}

export interface CreateConversationDto {
  organizationId: string;
  platform: Platform;
  platformConversationId: string;
  platformAccountId: string;
  participants: Array<{
    userId?: string;
    platformUserId: string;
    role: 'customer' | 'agent';
    name?: string;
  }>;
  status?: ConversationStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationDto {
  status?: ConversationStatus;
  assignedTo?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Message DTOs
// ============================================================================

export interface GetMessagesDto extends PaginationDto {
  conversationId: string;
  organizationId: string; // REQUIRED for multi-tenancy
}

export interface CreateMessageDto {
  conversationId: string;
  organizationId: string;
  platform: Platform;
  direction: 'inbound' | 'outbound';
  type: MessageType;
  senderId: string;
  recipientId: string;
  content: {
    text?: string;
    attachments?: Array<{
      type: MessageType;
      url: string;
      size?: number;
      filename?: string;
    }>;
  };
  metadata?: Record<string, unknown>;
}

export interface SendMessageDto {
  conversationId: string;
  organizationId: string;
  type: MessageType;
  content: {
    text?: string;
    attachments?: Array<{
      type: MessageType;
      url: string;
    }>;
  };
}

export interface UpdateMessageStatusDto {
  messageId: string;
  status: MessageStatus;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Platform Connection DTOs
// ============================================================================

export interface CreatePlatformConnectionDto {
  organizationId: string;
  platform: Platform;
  platformAccountId: string;
  platformAccountName: string;
  credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes?: string[];
  };
  status?: ConnectionStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdatePlatformConnectionDto {
  platformAccountName?: string;
  status?: ConnectionStatus;
  credentials?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes?: string[];
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OAuth DTOs
// ============================================================================

export interface OAuthCallbackDto {
  code: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface PlatformAuthUrlResponse {
  authUrl: string;
  state?: string;
}

// ============================================================================
// WebSocket DTOs
// ============================================================================

export interface TypingIndicatorDto {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface MessageReadDto {
  conversationId: string;
  messageIds: string[];
}

export interface UserPresenceDto {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeenAt?: Date;
}
