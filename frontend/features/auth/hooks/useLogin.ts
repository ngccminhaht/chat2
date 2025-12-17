'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '../stores/authStore';
import type { LoginRequest, AuthResponse } from '../types/auth.types';

export function useLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const response = await apiClient.post<AuthResponse>('/auth/login', data);
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
      // Always redirect to organization selector after login
      router.push('/organizations');
    },
  });
}
