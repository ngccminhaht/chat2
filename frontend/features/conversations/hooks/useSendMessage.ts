import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Message, MessageContent } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface SendMessageParams {
  conversationId: string;
  type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio' | 'location';
  content: MessageContent;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation<Message, Error, SendMessageParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post(
        `/organizations/${organizationId}/messages/send`,
        params
      );
      return data;
    },
    retry: false,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages', organizationId, data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
