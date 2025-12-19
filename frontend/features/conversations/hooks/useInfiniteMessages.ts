import { useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { MessagesResponse } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UseInfiniteMessagesParams {
  conversationId: string;
  limit?: number;
}

export function useInfiniteMessages({
  conversationId,
  limit = 30,
}: UseInfiniteMessagesParams) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useInfiniteQuery<MessagesResponse>({
    queryKey: ['messages', organizationId, conversationId, 'infinite'],
    queryFn: async ({ pageParam }) => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/messages/conversation/${conversationId}`,
        { params: { page: pageParam, limit } },
      );
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: !!organizationId && !!conversationId,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
    }),
  });
}
