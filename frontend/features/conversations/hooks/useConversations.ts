import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ConversationsResponse } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UseConversationsParams {
  status?: 'open' | 'closed' | 'archived';
  platform?: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
  assignedTo?: string;
  search?: string;
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
  });
}
