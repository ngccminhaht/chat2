'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

interface ApiKeyResponse {
  apiKey: string | null;
  masked: string | null;
}

export function useApiKey(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organizations', organizationId, 'api-key'],
    queryFn: async () => {
      const response = await apiClient.get<ApiKeyResponse>(
        `/organizations/${organizationId}/api-key`
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
}

export function useGenerateApiKey(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ apiKey: string }>(
        `/organizations/${organizationId}/api-key`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', organizationId, 'api-key'],
      });
    },
  });
}

export function useRevokeApiKey(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<{ success: boolean }>(
        `/organizations/${organizationId}/api-key`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', organizationId, 'api-key'],
      });
    },
  });
}
