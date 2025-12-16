import { useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { MessagesResponse } from '../types/conversation.types';

interface UseInfiniteMessagesParams {
  conversationId: string;
  limit?: number;
}

export function useInfiniteMessages({
  conversationId,
  limit = 30,
}: UseInfiniteMessagesParams) {
  return useInfiniteQuery<MessagesResponse>({
    queryKey: ['messages', conversationId, 'infinite'],
    queryFn: async ({ pageParam }) => {
      const { data } = await apiClient.get(
        `/messages/conversation/${conversationId}`,
        { params: { page: pageParam, limit } },
      );
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: !!conversationId,
    // Reverse order: newest messages first from API, we'll reverse for display
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
    }),
  });
}
