import { create } from 'zustand';
import { Conversation, Message } from '../types/conversation.types';

interface ConversationState {
  activeConversationId: string | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;

  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessageStatus: (conversationId: string, messageId: string, status: string) => void;
  markMessagesAsRead: (conversationId: string, messageIds: string[]) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeConversationId: null,
  conversations: [],
  messages: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (conversation) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c._id === conversation._id ? { ...c, ...conversation } : c
      ),
    })),

  addConversation: (conversation) =>
    set((state) => {
      // Check if conversation already exists
      const exists = state.conversations.some((c) => c._id === conversation._id);
      if (exists) {
        // Merge with existing conversation instead of replacing
        return {
          conversations: state.conversations.map((c) =>
            c._id === conversation._id ? { ...c, ...conversation } : c
          ),
        };
      }
      // Add new conversation to the beginning of the list
      return {
        conversations: [conversation, ...state.conversations],
      };
    }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => {
      const currentMessages = state.messages[conversationId] || [];
      // Check if message already exists (by _id)
      const existingIndex = currentMessages.findIndex((m) => m._id === message._id);

      if (existingIndex >= 0) {
        // Update existing message (e.g., status update)
        const updatedMessages = [...currentMessages];
        updatedMessages[existingIndex] = { ...currentMessages[existingIndex], ...message };
        return {
          messages: {
            ...state.messages,
            [conversationId]: updatedMessages,
          },
        };
      }

      // Add new message to the end
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...currentMessages, message],
        },
      };
    }),

  updateMessageStatus: (conversationId, messageId, status) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((msg) =>
          msg._id === messageId ? { ...msg, status: status as Message['status'] } : msg
        ),
      },
    })),

  markMessagesAsRead: (conversationId, messageIds) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((msg) =>
          messageIds.includes(msg._id) ? { ...msg, status: 'read' } : msg
        ),
      },
      conversations: state.conversations.map((conv) =>
        conv._id === conversationId ? { ...conv, unreadCount: 0 } : conv
      ),
    })),
}));

// Selector to get total unread count across all conversations
export const useTotalUnreadCount = () =>
  useConversationStore((state) =>
    state.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0)
  );
