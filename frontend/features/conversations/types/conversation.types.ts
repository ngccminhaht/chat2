export interface LastMessage {
  text: string;
  timestamp: Date;
  senderId: string;
  messageId: string;
  direction: 'inbound' | 'outbound';
}

export interface Conversation {
  _id: string;
  organizationId: string;
  platform: "facebook" | "zalo" | "tiktok" | "shopee" | "web";
  platformConversationId: string;
  platformConnectionId: string;
  customerPlatformUserId: string;
  customerName: string;
  customerAvatar?: string;
  status: "open" | "closed" | "archived";
  tags: string[];
  lastMessage?: LastMessage;
  unreadCount: number;
  unsentCount: number; // Messages not sent to AI and exceeded timeout
  metadata: Record<string, any>;
  // AI settings
  aiEnabled: boolean;
  aiState?: "AI_ACTIVE" | "BATCHING" | "AI_RESPONDING";
  createdAt: string;
  updatedAt: string;
}

export interface MessageContent {
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  [key: string]: any;
}

export interface MessageSender {
  platformUserId: string;
  name: string;
  avatar?: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  organizationId: string;
  platform: "facebook" | "zalo" | "tiktok" | "shopee";
  platformMessageId: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "video" | "file" | "sticker" | "audio" | "location";
  content: MessageContent;
  sender: MessageSender;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsResponse {
  data: Conversation[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MessagesResponse {
  data: Message[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ConversationNoteUser {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ConversationNote {
  _id: string;
  organizationId: string;
  conversationId: string;
  userId: string | ConversationNoteUser;
  content: string;
  isPrivate: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
