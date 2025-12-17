'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';
import type {
  OrganizationMember,
  InviteMemberRequest,
  OrganizationRole,
} from '../types/organization.types';

export function useOrganizationMembers() {
  const organizationId = useAuthStore((state) => state.organizationId);

  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const response = await apiClient.get<OrganizationMember[]>(
        `/organizations/${organizationId}/members`
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);

  return useMutation({
    mutationFn: async (data: InviteMemberRequest) => {
      if (!organizationId) throw new Error('No organization selected');
      const response = await apiClient.post<OrganizationMember>(
        `/organizations/${organizationId}/members`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', organizationId] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: OrganizationRole }) => {
      if (!organizationId) throw new Error('No organization selected');
      const response = await apiClient.put<OrganizationMember>(
        `/organizations/${organizationId}/members/${userId}`,
        { role }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', organizationId] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);

  return useMutation({
    mutationFn: async (userId: string) => {
      if (!organizationId) throw new Error('No organization selected');
      await apiClient.delete(`/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', organizationId] });
    },
  });
}
