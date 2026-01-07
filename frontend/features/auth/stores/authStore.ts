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
  // User info (from Keycloak token)
  user: User | null;
  // Organization data (persisted to localStorage)
  organizationId: string | null;
  organization: CurrentOrganization | null;
  organizations: Organization[];
  // Hydration state
  _hasHydrated: boolean;
  // Actions
  setUser: (user: User) => void;
  setOrganizations: (
    organizationId: string,
    organization: CurrentOrganization,
    organizations: Organization[],
  ) => void;
  switchOrganization: (
    organizationId: string,
    organization: CurrentOrganization,
  ) => void;
  clearAuth: () => void;
  getCurrentRole: () => string | null;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      organizationId: null,
      organization: null,
      organizations: [],
      _hasHydrated: false,
      setUser: (user) => set({ user }),
      setOrganizations: (organizationId, organization, organizations) =>
        set({ organizationId, organization, organizations }),
      switchOrganization: (organizationId, organization) =>
        set({ organizationId, organization }),
      clearAuth: () =>
        set({
          user: null,
          organizationId: null,
          organization: null,
          organizations: [],
        }),
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
