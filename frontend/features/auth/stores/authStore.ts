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
  _hasHydrated: boolean;
  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    organizationId: string,
    organization: CurrentOrganization,
    organizations: Organization[],
  ) => void;
  // Update only user and tokens, preserve organization data
  updateUserAndTokens: (
    user: User,
    accessToken: string,
    refreshToken: string,
  ) => void;
  switchOrganization: (
    accessToken: string,
    refreshToken: string,
    organizationId: string,
    organization: CurrentOrganization,
  ) => void;
  // Update organizations list (e.g., after creating new org)
  setOrganizations: (
    organizationId: string,
    organization: CurrentOrganization,
    organizations: Organization[],
  ) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  getCurrentRole: () => string | null;
  setHasHydrated: (state: boolean) => void;
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
      _hasHydrated: false,
      setAuth: (user, accessToken, refreshToken, organizationId, organization, organizations) =>
        set({ user, accessToken, refreshToken, organizationId, organization, organizations }),
      updateUserAndTokens: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      switchOrganization: (accessToken, refreshToken, organizationId, organization) =>
        set({ accessToken, refreshToken, organizationId, organization }),
      setOrganizations: (organizationId, organization, organizations) =>
        set({ organizationId, organization, organizations }),
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
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
