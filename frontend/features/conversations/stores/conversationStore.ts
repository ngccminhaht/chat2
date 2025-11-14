import { create } from 'zustand';

interface Conversation {
  _id: string;
  platform: string;
  participants: any[];
  lastMessage?: {
    text: string;
    timestamp: Date;
  };
  unreadCount: number;
  status: string;
}

interface Message {
  _id: string;
  conversationId: string;
  content: {
    text?: string;
    mediaUrl?: string;
  };
  sender: {
    platformUserId: string;
    name: string;
  };
  createdAt: Date;
  status: string;
}

interface ConversationState {
  activeConversationId: string | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;

  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessageStatus: (conversationId: string, messageId: string, status: string) => void;
  setTypingUsers: (conversationId: string, userIds: string[]) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeConversationId: null,
  conversations: [],
  messages: {},
  typingUsers: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (conversation) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c._id === conversation._id ? conversation : c
      ),
    })),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [
          ...(state.messages[conversationId] || []),
          message,
        ],
      },
    })),

  updateMessageStatus: (conversationId, messageId, status) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((msg) =>
          msg._id === messageId ? { ...msg, status } : msg
        ),
      },
    })),

  setTypingUsers: (conversationId, userIds) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [conversationId]: userIds },
    })),
}));
