import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export interface Agent {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'agent' | 'viewer';
  isActive: boolean;
}

interface AgentsResponse {
  data: Agent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Fetch list of agents/users in the organization
 * Used for assignment dropdown
 */
export function useAgents() {
  return useQuery<AgentsResponse>({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data } = await apiClient.get('/users', {
        params: {
          role: 'agent,admin', // Only get users who can handle conversations
          isActive: true,
          limit: 100,
        },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
