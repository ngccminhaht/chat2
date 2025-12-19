import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { MessagesResponse } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UseMessagesParams {
  conversationId: string;
  page?: number;
  limit?: number;
}

export function useMessages({ conversationId, page = 1, limit = 50 }: UseMessagesParams) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<MessagesResponse>({
    queryKey: ['messages', organizationId, conversationId, page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/messages/conversation/${conversationId}`,
        { params: { page, limit } }
      );
      return data;
    },
    enabled: !!organizationId && !!conversationId,
  });
}
