import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import {
  QuickReply,
  QuickRepliesResponse,
  CreateQuickReplyDto,
  UpdateQuickReplyDto,
} from '../types/quick-reply.types';

interface UseQuickRepliesParams {
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

/**
 * Fetch all quick replies for the organization
 */
export function useQuickReplies(params: UseQuickRepliesParams = {}) {
  return useQuery<QuickRepliesResponse>({
    queryKey: ['quick-replies', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/quick-replies', { params });
      return data;
    },
  });
}

/**
 * Create a new quick reply
 */
export function useCreateQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateQuickReplyDto) => {
      const { data } = await apiClient.post<QuickReply>('/quick-replies', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}

/**
 * Update a quick reply
 */
export function useUpdateQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateQuickReplyDto }) => {
      const { data } = await apiClient.patch<QuickReply>(`/quick-replies/${id}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}

/**
 * Delete a quick reply
 */
export function useDeleteQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/quick-replies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}

/**
 * Track quick reply usage
 */
export function useTrackQuickReplyUsage() {
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/quick-replies/${id}/use`);
    },
  });
}
