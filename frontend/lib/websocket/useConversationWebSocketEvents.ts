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
 */
export function useConversationWebSocketEvents() {
  const queryClient = useQueryClient();
  const addMessage = useConversationStore((state) => state.addMessage);
  const updateMessageStatus = useConversationStore((state) => state.updateMessageStatus);
  const updateConversation = useConversationStore((state) => state.updateConversation);
  const addConversation = useConversationStore((state) => state.addConversation);
  const markMessagesAsRead = useConversationStore((state) => state.markMessagesAsRead);

  // Handle new messages
  // Payload format: { conversationId, message } from org broadcast
  useWebSocketEvent<{ conversationId: string; message: Message }>('message:new', (data) => {
    console.log('[WS] New message:', data);
    const message = data.message;
    if (message) {
      addMessage(data.conversationId, message);
    }
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
}
