/**
 * Constants Barrel Export
 * Central export point for all constants
 */

export * from './platforms.constant';
export * from './statuses.constant';
export * from './api-endpoints.constant';

/**
 * Kafka Topics
 */
export const KAFKA_TOPICS = {
  WEBHOOKS_RAW: 'platform.webhooks.raw',
  MESSAGES_INCOMING: 'messages.incoming',
  MESSAGES_OUTGOING: 'messages.outgoing',
  MESSAGES_STATUS: 'messages.status',
  WEBSOCKET_NOTIFICATIONS: 'websocket.notifications',
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * Date/Time
 */
export const TIME = {
  ONE_HOUR_MS: 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * WebSocket Events
 */
export const WS_EVENTS = {
  // Server → Client
  NEW_MESSAGE: 'message:new',
  MESSAGE_STATUS_UPDATED: 'message:status_updated',
  CONVERSATION_UPDATED: 'conversation:updated',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_PRESENCE: 'user:presence',

  // Client → Server
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  SEND_TYPING: 'typing:send',
  MARK_READ: 'message:mark_read',
} as const;
