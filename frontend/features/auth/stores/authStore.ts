import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Organization } from '../types/auth.types';

interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  organizationId: string | null;
  organization: CurrentOrganization | null;
  organizations: Organization[];
  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    organizationId: string,
    organization: CurrentOrganization,
    organizations: Organization[],
  ) => void;
  switchOrganization: (
    accessToken: string,
    refreshToken: string,
    organizationId: string,
    organization: CurrentOrganization,
  ) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  getCurrentRole: () => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      organizationId: null,
      organization: null,
      organizations: [],
      setAuth: (user, accessToken, refreshToken, organizationId, organization, organizations) =>
        set({ user, accessToken, refreshToken, organizationId, organization, organizations }),
      switchOrganization: (accessToken, refreshToken, organizationId, organization) =>
        set({ accessToken, refreshToken, organizationId, organization }),
      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          organizationId: null,
          organization: null,
          organizations: [],
        }),
      isAuthenticated: () => !!get().accessToken,
      getCurrentRole: () => {
        const state = get();
        if (!state.organizationId || !state.organizations.length) return null;
        const org = state.organizations.find((o) => o.id === state.organizationId);
        return org?.role || null;
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);
