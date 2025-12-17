import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import {
  AiAgent,
  AiAgentsResponse,
  AiAgentStatus,
  CreateAiAgentDto,
  UpdateAiAgentDto,
} from '../types/ai-agent.types';

interface UseAiAgentsParams {
  status?: AiAgentStatus;
  page?: number;
  limit?: number;
}

/**
 * Fetch all AI agents for the organization
 */
export function useAiAgents(params: UseAiAgentsParams = {}) {
  return useQuery<AiAgentsResponse>({
    queryKey: ['ai-agents', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/ai-agents', { params });
      return data;
    },
  });
}

/**
 * Fetch active AI agents for assignment dropdown
 */
export function useActiveAiAgents() {
  return useQuery<AiAgent[]>({
    queryKey: ['ai-agents', 'active'],
    queryFn: async () => {
      const { data } = await apiClient.get('/ai-agents/active');
      return data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Fetch single AI agent by ID
 */
export function useAiAgent(id: string) {
  return useQuery<AiAgent>({
    queryKey: ['ai-agent', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/ai-agents/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new AI agent
 */
export function useCreateAiAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateAiAgentDto) => {
      const { data } = await apiClient.post<AiAgent>('/ai-agents', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });
}

/**
 * Update an AI agent
 */
export function useUpdateAiAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateAiAgentDto }) => {
      const { data } = await apiClient.patch<AiAgent>(`/ai-agents/${id}`, dto);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.setQueryData(['ai-agent', data._id], data);
    },
  });
}

/**
 * Delete an AI agent
 */
export function useDeleteAiAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });
}
