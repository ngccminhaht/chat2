'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketEvent } from './useWebSocketEvent';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import { Message, Conversation } from '@/features/conversations/types/conversation.types';

/**
 * Hook to setup all conversation-related WebSocket event listeners
 * Call this once in root layout or main conversation component
 *
 * Events handled:
 * - message:new - New message received
 * - message:status - Message status update
 * - conversation:updated - Conversation updated
 * - message:read - Messages marked as read
 * - typing:indicator - Typing indicator
 */
export function useConversationWebSocketEvents() {
  const queryClient = useQueryClient();
  const addMessage = useConversationStore((state) => state.addMessage);
  const updateMessageStatus = useConversationStore((state) => state.updateMessageStatus);
  const updateConversation = useConversationStore((state) => state.updateConversation);
  const addConversation = useConversationStore((state) => state.addConversation);
  const markMessagesAsRead = useConversationStore((state) => state.markMessagesAsRead);
  const setTypingUsers = useConversationStore((state) => state.setTypingUsers);

  // Handle new messages
  useWebSocketEvent<Message>('message:new', (message) => {
    console.log('[WS] New message:', message);
    addMessage(message.conversationId, message);
  });

  // Handle message status updates
  useWebSocketEvent<{ conversationId: string; messageId: string; status: string }>(
    'message:status',
    (data) => {
      console.log('[WS] Message status update:', data);
      updateMessageStatus(data.conversationId, data.messageId, data.status);
    }
  );

  // Handle conversation updates
  useWebSocketEvent<Conversation>('conversation:updated', (conversation) => {
    console.log('[WS] Conversation updated:', conversation);

    // Check if conversation exists in store
    const conversations = useConversationStore.getState().conversations;
    const exists = conversations.some((c) => c._id === conversation._id);

    if (exists) {
      updateConversation(conversation);
    } else {
      addConversation(conversation);
    }

    // Invalidate TanStack Query cache to refetch latest data
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['conversation', conversation._id] });
  });

  // Handle messages marked as read
  useWebSocketEvent<{ conversationId: string; messageIds: string[] }>(
    'message:read',
    (data) => {
      console.log('[WS] Messages read:', data);
      markMessagesAsRead(data.conversationId, data.messageIds);
    }
  );

  // Handle typing indicators
  useWebSocketEvent<{ conversationId: string; userId: string; isTyping: boolean }>(
    'typing:indicator',
    (data) => {
      console.log('[WS] Typing indicator:', data);

      const typingUsers = useConversationStore.getState().typingUsers[data.conversationId] || [];

      if (data.isTyping) {
        // Add user to typing list if not already there
        if (!typingUsers.includes(data.userId)) {
          setTypingUsers(data.conversationId, [...typingUsers, data.userId]);
        }
      } else {
        // Remove user from typing list
        setTypingUsers(
          data.conversationId,
          typingUsers.filter((id) => id !== data.userId)
        );
      }
    }
  );
}
