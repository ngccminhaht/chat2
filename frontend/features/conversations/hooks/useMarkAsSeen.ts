import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

interface MarkAsSeenParams {
  conversationId: string;
}

export function useMarkAsSeen() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organizationId);

  return useMutation({
    mutationFn: async ({ conversationId }: MarkAsSeenParams) => {
      if (!organizationId) throw new Error('No organization ID');

      const response = await apiClient.post(
        `/organizations/${organizationId}/conversations/${conversationId}/mark-seen`
      );
      return response.data;
    },
    onSuccess: (_, { conversationId }) => {
      // Invalidate conversation query to refresh unreadCount and unsentCount
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });
    },
  });
}
