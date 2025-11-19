import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Message, MessageContent } from '../types/conversation.types';

interface SendMessageParams {
  conversationId: string;
  type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio' | 'location';
  content: MessageContent;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<Message, Error, SendMessageParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post('/messages/send', params);
      return data;
    },
    retry: false, // Prevent automatic retries
    onSuccess: (data) => {
      // Invalidate messages query to refetch
      queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
      // Invalidate conversations to update lastMessage
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
