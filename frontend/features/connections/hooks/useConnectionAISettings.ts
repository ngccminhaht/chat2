import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ConnectionAISettings } from '../types/platform-connection.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

export const useConnectionAISettings = (connectionId: string | null) => {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery({
    queryKey: ['connection-ai-settings', connectionId],
    queryFn: async () => {
      const response = await apiClient.get<ConnectionAISettings>(
        `/organizations/${organizationId}/connections/${connectionId}/ai-settings`
      );
      return response.data;
    },
    enabled: !!organizationId && !!connectionId,
  });
};

export const useUpdateConnectionAISettings = () => {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      connectionId,
      settings,
    }: {
      connectionId: string;
      settings: ConnectionAISettings;
    }) => {
      const response = await apiClient.patch<ConnectionAISettings>(
        `/organizations/${organizationId}/connections/${connectionId}/ai-settings`,
        settings
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connection-ai-settings', variables.connectionId] });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};
