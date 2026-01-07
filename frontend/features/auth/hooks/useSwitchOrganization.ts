'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '../stores/authStore';
import type {
  SwitchOrganizationRequest,
  SwitchOrganizationResponse,
} from '../types/auth.types';

export function useSwitchOrganization() {
  const queryClient = useQueryClient();
  const switchOrganization = useAuthStore((state) => state.switchOrganization);

  return useMutation({
    mutationFn: async (data: SwitchOrganizationRequest) => {
      const response = await apiClient.post<SwitchOrganizationResponse>(
        '/auth/switch-organization',
        data,
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update organization in store - tokens are managed by Keycloak
      switchOrganization(data.organizationId, data.organization);
      // Invalidate all queries to refetch with new organization context
      queryClient.invalidateQueries();
    },
  });
}
