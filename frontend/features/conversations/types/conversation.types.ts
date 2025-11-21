export interface LastMessage {
  text: string;
  timestamp: Date;
  senderId: string;
  messageId: string;
}

export interface Conversation {
  _id: string;
  organizationId: string;
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
  platformConversationId: string;
  platformConnectionId: string;
  customerPlatformUserId: string;
  customerName: string;
  customerAvatar?: string;
  status: 'open' | 'closed' | 'archived';
  assignedTo?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  tags: string[];
  lastMessage?: LastMessage;
  unreadCount: number;
  metadata: Record<string, any>;
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
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
  platformMessageId: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio' | 'location';
  content: MessageContent;
  sender: MessageSender;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
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
