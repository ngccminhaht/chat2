import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export interface WidgetConfig {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  primaryColor: string;
  position: 'left' | 'right';
  greeting: string;
  logo?: string;
  offlineMessage: string;
  preChatForm: boolean;
  preChatFields: string[];
}

export interface UpdateWidgetConfigDto {
  primaryColor?: string;
  position?: 'left' | 'right';
  greeting?: string;
  logo?: string;
  offlineMessage?: string;
  preChatForm?: boolean;
  preChatFields?: string[];
}

export function useWidgetConfig() {
  return useQuery<WidgetConfig>({
    queryKey: ['widget-config'],
    queryFn: async () => {
      const { data } = await apiClient.get('/widget/config');
      return data;
    },
  });
}

export function useUpdateWidgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateWidgetConfigDto) => {
      const { data } = await apiClient.patch<WidgetConfig>('/widget/config', dto);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['widget-config'], data);
    },
  });
}
