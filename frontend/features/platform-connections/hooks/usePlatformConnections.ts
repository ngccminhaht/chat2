import { useQuery } from '@tanstack/react-query';
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
