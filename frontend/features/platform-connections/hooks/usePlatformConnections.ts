import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { PlatformConnection } from '../types/platform-connection.types';

export const usePlatformConnections = () => {
  return useQuery({
    queryKey: ['platform-connections'],
    queryFn: async () => {
      const response = await apiClient.get<PlatformConnection[]>(
        '/platform-connections'
      );
      return response.data;
    },
  });
};

export const useDeletePlatformConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      await apiClient.delete(`/platform-connections/${connectionId}`);
    },
    onSuccess: () => {
      // Refetch connections list after successful deletion
      queryClient.invalidateQueries({ queryKey: ['platform-connections'] });
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
      status: 'active' | 'inactive' | 'expired';
    }) => {
      await apiClient.patch(`/platform-connections/${connectionId}/status`, {
        status,
      });
    },
    onSuccess: () => {
      // Refetch connections list after successful status update
      queryClient.invalidateQueries({ queryKey: ['platform-connections'] });
    },
  });
};
