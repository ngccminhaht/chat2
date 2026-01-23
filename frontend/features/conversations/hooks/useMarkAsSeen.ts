import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useConversationStore } from '../stores/conversationStore';

interface MarkAsSeenParams {
  conversationId: string;
}

export function useMarkAsSeen() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);

  return useMutation({
    mutationFn: async ({ conversationId }: MarkAsSeenParams) => {
      if (!organizationId) throw new Error('No organization ID');

      const response = await apiClient.post(
        `/organizations/${organizationId}/conversations/${conversationId}/mark-seen`
      );
      return response.data;
    },
    onSuccess: (_, { conversationId }) => {
      // Update Zustand store immediately to reset badge counts
      useConversationStore.getState().updateConversation({
        _id: conversationId,
        unreadCount: 0,
        unsentCount: 0,
      } as any);

      // Invalidate conversation query to refresh from server
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });
    },
  });
}
