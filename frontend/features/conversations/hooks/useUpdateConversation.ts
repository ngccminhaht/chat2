import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Conversation } from '../types/conversation.types';

interface UpdateConversationDto {
  status?: 'open' | 'closed' | 'archived';
  assignedTo?: string | null;
  tags?: string[];
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      data,
    }: {
      conversationId: string;
      data: UpdateConversationDto;
    }) => {
      const response = await apiClient.patch<Conversation>(
        `/conversations/${conversationId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updatedConversation) => {
      // Invalidate conversations list to refetch
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Update specific conversation cache
      queryClient.setQueryData(
        ['conversation', updatedConversation._id],
        updatedConversation,
      );
    },
  });
}
