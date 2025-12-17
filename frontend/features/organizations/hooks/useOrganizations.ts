'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { Organization } from '@/features/auth/types/auth.types';

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const response = await apiClient.get<Organization[]>('/organizations');
      return response.data;
    },
  });
}
