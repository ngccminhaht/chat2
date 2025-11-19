/**
 * Status Constants (Frontend)
 * Must match backend enums
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

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  [ConversationStatus.OPEN]: 'Open',
  [ConversationStatus.PENDING]: 'Pending',
  [ConversationStatus.RESOLVED]: 'Resolved',
  [ConversationStatus.CLOSED]: 'Closed',
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  [MessageStatus.PENDING]: 'Sending...',
  [MessageStatus.SENT]: 'Sent',
  [MessageStatus.DELIVERED]: 'Delivered',
  [MessageStatus.READ]: 'Read',
  [MessageStatus.FAILED]: 'Failed',
};
