import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ConversationsResponse } from '../types/conversation.types';

interface UseConversationsParams {
  status?: 'open' | 'closed' | 'archived';
  platform?: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
  assignedTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useConversations(params: UseConversationsParams = {}) {
  return useQuery<ConversationsResponse>({
    queryKey: ['conversations', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/conversations', { params });
      return data;
    },
  });
}
