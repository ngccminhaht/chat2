/**
 * Constants Barrel Export (Frontend)
 */

export * from './platforms';
export * from './statuses';

/**
 * API Configuration
 */
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  TIMEOUT: 30000,
} as const;

/**
 * WebSocket Configuration
 */
export const WS_CONFIG = {
  URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000',
  RECONNECT_INTERVAL: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  CONVERSATIONS_PER_PAGE: 20,
  MESSAGES_PER_PAGE: 50,
} as const;

/**
 * WebSocket Events (must match backend)
 */
export const WS_EVENTS = {
  // Server → Client
  NEW_MESSAGE: 'message:new',
  MESSAGE_STATUS_UPDATED: 'message:status_updated',
  CONVERSATION_UPDATED: 'conversation:updated',
  USER_PRESENCE: 'user:presence',

  // Client → Server
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  MARK_READ: 'message:mark_read',
} as const;

/**
 * Local Storage Keys
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  THEME: 'theme',
} as const;
