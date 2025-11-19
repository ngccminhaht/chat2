import { create } from 'zustand';
import { Conversation, Message } from '../types/conversation.types';

interface ConversationState {
  activeConversationId: string | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;

  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessageStatus: (conversationId: string, messageId: string, status: string) => void;
  markMessagesAsRead: (conversationId: string, messageIds: string[]) => void;
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

  addConversation: (conversation) =>
    set((state) => {
      // Check if conversation already exists
      const exists = state.conversations.some((c) => c._id === conversation._id);
      if (exists) {
        // Update existing conversation instead
        return {
          conversations: state.conversations.map((c) =>
            c._id === conversation._id ? conversation : c
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
    })),

  setTypingUsers: (conversationId, userIds) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [conversationId]: userIds },
    })),
}));
