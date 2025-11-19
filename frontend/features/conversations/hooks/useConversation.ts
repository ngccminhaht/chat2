import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Conversation } from '../types/conversation.types';

interface UseConversationParams {
  conversationId: string;
}

export function useConversation({ conversationId }: UseConversationParams) {
  return useQuery<Conversation>({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/conversations/${conversationId}`);
      return data;
    },
    enabled: !!conversationId,
  });
}
