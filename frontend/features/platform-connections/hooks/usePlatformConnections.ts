import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { PlatformConnection } from '../types/platform-connection.types';
import { ConnectionStatus } from '@/lib/constants';

export const usePlatformConnections = () => {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const response = await apiClient.get<PlatformConnection[]>(
        '/connections'
      );
      return response.data;
    },
  });
};

export const useDeletePlatformConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      await apiClient.delete(`/connections/${connectionId}`);
    },
    onSuccess: () => {
      // Refetch connections list after successful deletion
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};

export const useUpdatePlatformConnectionStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      connectionId,
      status,
    }: {
      connectionId: string;
      status: ConnectionStatus;
    }) => {
      await apiClient.patch(`/connections/${connectionId}/status`, {
        status,
      });
    },
    onSuccess: () => {
      // Refetch connections list after successful status update
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};
