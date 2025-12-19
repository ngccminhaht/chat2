import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Conversation } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UseConversationParams {
  conversationId: string;
}

export function useConversation({ conversationId }: UseConversationParams) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<Conversation>({
    queryKey: ['conversation', organizationId, conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/conversations/${conversationId}`
      );
      return data;
    },
    enabled: !!organizationId && !!conversationId,
  });
}
