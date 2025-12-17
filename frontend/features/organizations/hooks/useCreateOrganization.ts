'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';
import type {
  CreateOrganizationRequest,
  CreateOrganizationResponse,
} from '../types/create-organization.types';

export function useCreateOrganization() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, accessToken, refreshToken, organizations, setAuth } = useAuthStore();

  return useMutation({
    mutationFn: async (data: CreateOrganizationRequest) => {
      const response = await apiClient.post<CreateOrganizationResponse>(
        '/organizations',
        data
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (user && accessToken && refreshToken) {
        // Add new org to organizations list
        const newOrg = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          plan: data.plan as 'free' | 'starter' | 'pro' | 'enterprise',
          role: 'owner' as const,
        };
        setAuth(
          user,
          accessToken,
          refreshToken,
          data.id,
          { id: data.id, name: data.name, slug: data.slug, plan: data.plan },
          [...organizations, newOrg]
        );
      }
      // Invalidate organizations query to refresh list
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      // Redirect back to organizations selector
      router.push('/organizations');
    },
  });
}
