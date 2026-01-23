import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ConversationsResponse } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UseConversationsParams {
  status?: 'open' | 'closed' | 'archived';
  platform?: 'facebook' | 'zalo' | 'tiktok' | 'shopee' | 'web';
  search?: string;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export function useConversations(params: UseConversationsParams = {}) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<ConversationsResponse>({
    queryKey: ['conversations', organizationId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/conversations`,
        { params }
      );
      return data;
    },
    enabled: !!organizationId,
    staleTime: 10 * 1000, // Data becomes stale after 10 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
  });
}
