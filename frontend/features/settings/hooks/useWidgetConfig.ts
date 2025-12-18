import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

export interface WidgetConfig {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  // Appearance
  buttonStyle: 'circle' | 'pill' | 'square';
  buttonSize: number;
  buttonIcon: 'chat' | 'message' | 'messenger' | 'custom';
  customIconUrl?: string;
  position: 'left' | 'right';
  marginRight: number;
  marginBottom: number;
  marginBottomMobile: number;
  // Colors
  primaryColor: string;
  textColor: 'light' | 'dark';
  // Avatar
  avatarName?: string;
  avatarUrl?: string;
  // Window size
  windowHeightMobile: number;
  windowHeight: number;
  windowHeightUnit: '%' | 'px';
  // Messages
  greeting: string;
  offlineMessage: string;
  // Pre-chat form
  preChatForm: boolean;
  preChatFields: string[];
  // Legacy
  logo?: string;
}

export interface UpdateWidgetConfigDto {
  buttonStyle?: 'circle' | 'pill' | 'square';
  buttonSize?: number;
  buttonIcon?: 'chat' | 'message' | 'messenger' | 'custom';
  customIconUrl?: string;
  position?: 'left' | 'right';
  marginRight?: number;
  marginBottom?: number;
  marginBottomMobile?: number;
  primaryColor?: string;
  textColor?: 'light' | 'dark';
  avatarName?: string;
  avatarUrl?: string;
  windowHeightMobile?: number;
  windowHeight?: number;
  windowHeightUnit?: '%' | 'px';
  greeting?: string;
  offlineMessage?: string;
  preChatForm?: boolean;
  preChatFields?: string[];
  logo?: string;
}

export function useWidgetConfig() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<WidgetConfig>({
    queryKey: ['widget-config', organizationId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/organizations/${organizationId}/widget`);
      return data;
    },
    enabled: !!organizationId,
  });
}

export function useUpdateWidgetConfig() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async (dto: UpdateWidgetConfigDto) => {
      const { data } = await apiClient.patch<WidgetConfig>(
        `/organizations/${organizationId}/widget`,
        dto
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['widget-config', organizationId], data);
    },
  });
}
