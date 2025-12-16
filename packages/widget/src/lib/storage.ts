import { nanoid } from 'nanoid';

const STORAGE_PREFIX = 'miagent_';

export interface Message {
  id: string;
  text?: string;
  mediaUrl?: string;
  direction: 'inbound' | 'outbound';
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
}

export function getOrCreateSessionId(): string {
  const key = `${STORAGE_PREFIX}session_id`;

  try {
    let sessionId = localStorage.getItem(key);

    if (!sessionId) {
      sessionId = nanoid(21);
      localStorage.setItem(key, sessionId);
    }

    return sessionId;
  } catch {
    // localStorage not available (private browsing, etc.)
    return nanoid(21);
  }
}

export function getMessages(sessionId: string): Message[] {
  const key = `${STORAGE_PREFIX}messages_${sessionId}`;

  try {
    const data = localStorage.getItem(key);
    if (!data) return [];

    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveMessage(sessionId: string, message: Message): void {
  try {
    const messages = getMessages(sessionId);
    const existingIndex = messages.findIndex((m) => m.id === message.id);

    if (existingIndex >= 0) {
      messages[existingIndex] = message;
    } else {
      messages.push(message);
    }

    // Keep last 100 messages
    const trimmed = messages.slice(-100);

    const key = `${STORAGE_PREFIX}messages_${sessionId}`;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors
  }
}

export function getUnreadCount(sessionId: string): number {
  const key = `${STORAGE_PREFIX}unread_${sessionId}`;

  try {
    const count = localStorage.getItem(key);
    return count ? parseInt(count, 10) : 0;
  } catch {
    return 0;
  }
}

export function setUnreadCount(sessionId: string, count: number): void {
  const key = `${STORAGE_PREFIX}unread_${sessionId}`;

  try {
    localStorage.setItem(key, count.toString());
  } catch {
    // Ignore storage errors
  }
}

export function incrementUnread(sessionId: string): void {
  const current = getUnreadCount(sessionId);
  setUnreadCount(sessionId, current + 1);
}

export function clearUnread(sessionId: string): void {
  setUnreadCount(sessionId, 0);
}

export function getVisitorInfo(sessionId: string): { name?: string; email?: string; phone?: string } {
  const key = `${STORAGE_PREFIX}visitor_${sessionId}`;

  try {
    const data = localStorage.getItem(key);
    if (!data) return {};

    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function saveVisitorInfo(
  sessionId: string,
  info: { name?: string; email?: string; phone?: string }
): void {
  const key = `${STORAGE_PREFIX}visitor_${sessionId}`;

  try {
    localStorage.setItem(key, JSON.stringify(info));
  } catch {
    // Ignore storage errors
  }
}
