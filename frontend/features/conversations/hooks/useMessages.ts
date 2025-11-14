import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { MessagesResponse } from '../types/conversation.types';

interface UseMessagesParams {
  conversationId: string;
  page?: number;
  limit?: number;
}

export function useMessages({ conversationId, page = 1, limit = 50 }: UseMessagesParams) {
  return useQuery<MessagesResponse>({
    queryKey: ['messages', conversationId, page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get(`/messages/conversation/${conversationId}`, {
        params: { page, limit },
      });
      return data;
    },
    enabled: !!conversationId,
  });
}
