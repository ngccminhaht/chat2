import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { PlatformConnection } from '../types/platform-connection.types';
import { ConnectionStatus } from '@/lib/constants';
import { useAuthStore } from '@/features/auth/stores/authStore';

export const usePlatformConnections = () => {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery({
    queryKey: ['connections', organizationId],
    queryFn: async () => {
      const response = await apiClient.get<PlatformConnection[]>(
        `/organizations/${organizationId}/connections`
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
};

export const useDeletePlatformConnection = () => {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async (connectionId: string) => {
      await apiClient.delete(`/organizations/${organizationId}/connections/${connectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};

export const useUpdatePlatformConnectionStatus = () => {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({
      connectionId,
      status,
    }: {
      connectionId: string;
      status: ConnectionStatus;
    }) => {
      await apiClient.patch(`/organizations/${organizationId}/connections/${connectionId}/status`, {
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};
