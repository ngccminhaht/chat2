import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface MarkAsReadParams {
  conversationId: string;
}

export function useMarkAsRead() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({ conversationId }: MarkAsReadParams) => {
      const { data } = await apiClient.patch(
        `/organizations/${organizationId}/messages/mark-read`,
        { conversationId }
      );
      return data;
    },
  });
}
