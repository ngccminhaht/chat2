import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

export interface AIAgentConfig {
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  batchDelayMs?: number;
  maxImages?: number;
}

export interface UpdateAIAgentDto {
  enabled?: boolean;
  apiKey?: string;
  endpoint?: string;
  batchDelayMs?: number;
  maxImages?: number;
}

export function useAIAgentConfig() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<AIAgentConfig>({
    queryKey: ['ai-agent-config', organizationId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/organizations/${organizationId}/ai-agent`);
      return data;
    },
    enabled: !!organizationId,
  });
}

export function useUpdateAIAgentConfig() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async (dto: UpdateAIAgentDto) => {
      const { data } = await apiClient.patch<AIAgentConfig>(
        `/organizations/${organizationId}/ai-agent`,
        dto
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['ai-agent-config', organizationId], data);
    },
  });
}
