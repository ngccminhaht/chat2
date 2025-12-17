'use client';

import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { InviteMemberRequest, InviteMemberResponse } from '../types/onboarding.types';

export function useInviteMembers() {
  return useMutation({
    mutationFn: async (data: InviteMemberRequest) => {
      const response = await apiClient.post<InviteMemberResponse>(
        '/organizations/members/invite',
        data
      );
      return response.data;
    },
  });
}

export function useBulkInviteMembers() {
  return useMutation({
    mutationFn: async (invites: InviteMemberRequest[]) => {
      const results = await Promise.allSettled(
        invites.map((invite) =>
          apiClient.post<InviteMemberResponse>('/organizations/members/invite', invite)
        )
      );
      return results;
    },
  });
}
