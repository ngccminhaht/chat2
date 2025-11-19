import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

interface MarkAsReadParams {
  conversationId: string;
}

export function useMarkAsRead() {
  return useMutation({
    mutationFn: async ({ conversationId }: MarkAsReadParams) => {
      const { data } = await apiClient.patch('/messages/mark-read', {
        conversationId,
      });
      return data;
    },
  });
}
