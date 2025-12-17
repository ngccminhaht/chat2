'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '../stores/authStore';
import type { RegisterRequest, AuthResponse } from '../types/auth.types';

export function useRegister() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const response = await apiClient.post<AuthResponse>('/auth/register', data);
      return response.data;
    },
    onSuccess: (data) => {
      setAuth(
        data.user,
        data.accessToken,
        data.refreshToken,
        data.organizationId,
        data.organization,
        data.organizations,
      );
      // New users must create an organization first
      const hasOrganization = data.organizationId || data.organizations?.length > 0;
      router.push(hasOrganization ? '/conversations' : '/create-organization');
    },
  });
}
