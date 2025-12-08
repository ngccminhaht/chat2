/**
 * Status Constants
 * Centralized status enums for various entities
 */

export enum ConnectionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  EXPIRED = 'expired',
  ERROR = 'error',
}

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  FILE = 'file',
  STICKER = 'sticker',
  AUDIO = 'audio',
  LOCATION = 'location',
  TEMPLATE = 'template',
  QUICK_REPLY = 'quick_reply',
  UNKNOWN = 'unknown',
}

export enum ParticipantRole {
  CUSTOMER = 'customer',
  AGENT = 'agent',
  BOT = 'bot',
}
