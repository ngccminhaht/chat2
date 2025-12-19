import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Conversation } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface UpdateConversationDto {
  status?: 'open' | 'closed' | 'archived';
  assignedTo?: string | null;
  tags?: string[];
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      conversationId,
      data,
    }: {
      conversationId: string;
      data: UpdateConversationDto;
    }) => {
      const response = await apiClient.patch<Conversation>(
        `/organizations/${organizationId}/conversations/${conversationId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updatedConversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.setQueryData(
        ['conversation', organizationId, updatedConversation._id],
        updatedConversation,
      );
    },
  });
}
