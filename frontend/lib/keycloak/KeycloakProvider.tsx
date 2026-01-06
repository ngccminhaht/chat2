'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { useAuthStore } from '@/features/auth/stores/authStore';
import apiClient from '@/lib/api/client';

interface KeycloakContextType {
  keycloak: Keycloak | null;
  initialized: boolean;
  authenticated: boolean;
  isLoggingOut: boolean;
  login: () => void;
  logout: () => void;
  token: string | undefined;
}

const KeycloakContext = createContext<KeycloakContextType>({
  keycloak: null,
  initialized: false,
  authenticated: false,
  isLoggingOut: false,
  login: () => {},
  logout: () => {},
  token: undefined,
});

export const useKeycloak = () => useContext(KeycloakContext);

interface KeycloakProviderProps {
  children: ReactNode;
}

// Singleton Keycloak instance to prevent React 18 Strict Mode double-init
let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const didInit = useRef(false);

  const updateUserAndTokens = useAuthStore((state) => state.updateUserAndTokens);
  const setOrganizations = useAuthStore((state) => state.setOrganizations);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  // Fetch organizations from API and sync to authStore
  const fetchAndSyncOrganizations = useCallback(async (token: string) => {
    try {
      const response = await apiClient.get('/organizations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const orgs = response.data;

      if (orgs && orgs.length > 0) {
        // Get current org from store or use first org
        const currentOrgId = useAuthStore.getState().organizationId;
        const currentOrg = orgs.find((o: any) => o.id === currentOrgId) || orgs[0];

        setOrganizations(
          currentOrg.id,
          { id: currentOrg.id, name: currentOrg.name, slug: currentOrg.slug, plan: currentOrg.plan },
          orgs
        );
      }
    } catch {
      // Failed to fetch organizations - will retry on next auth
    }
  }, [setOrganizations]);

  const setupTokenRefresh = useCallback((kc: Keycloak) => {
    // Refresh token when expired
    kc.onTokenExpired = () => {
      kc.updateToken(30)
        .then((refreshed) => {
          if (refreshed && kc.token) {
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${kc.token}`;
          }
        })
        .catch(() => {
          clearAuth();
        });
    };

    // Periodic refresh every minute
    const refreshInterval = setInterval(() => {
      if (kc.authenticated) {
        kc.updateToken(300).catch(() => {
          // Periodic refresh failed - will retry
        });
      }
    }, 60000);

    return () => clearInterval(refreshInterval);
  }, [clearAuth]);

  useEffect(() => {
    // Prevent double init in React 18 Strict Mode
    if (didInit.current) return;
    didInit.current = true;

    // Reuse singleton instance
    if (!keycloakInstance) {
      keycloakInstance = new Keycloak({
        url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || '',
        realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || '',
        clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
      });
    }

    const kcInstance = keycloakInstance;

    // Reuse init promise to prevent double init
    if (!initPromise) {
      initPromise = kcInstance.init({
        // check-sso: silently check SSO session without redirect
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      });
    }

    initPromise
      .then((auth) => {
        // Clear flags on success
        sessionStorage.removeItem('keycloak_redirect_attempted');
        sessionStorage.removeItem('keycloak_logging_out');

        setKeycloak(kcInstance);
        setInitialized(true);
        setAuthenticated(auth);
        setIsLoggingOut(false);

        if (auth && kcInstance.token) {
          // Set token in API client
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${kcInstance.token}`;

          // Extract user info from token
          const tokenParsed = kcInstance.tokenParsed as any;
          if (tokenParsed) {
            const user = {
              id: tokenParsed.sub,
              email: tokenParsed.email,
              name: tokenParsed.name || tokenParsed.preferred_username,
              avatarUrl: tokenParsed.picture || null,
            };

            // Update user and tokens only, preserve organization data from localStorage
            updateUserAndTokens(user, kcInstance.token, kcInstance.refreshToken || '');
          }

          // Fetch organizations from API and sync to store
          fetchAndSyncOrganizations(kcInstance.token);

          // Setup token refresh
          setupTokenRefresh(kcInstance);
        }
      })
      .catch(() => {
        // Mark that we attempted redirect to prevent loop
        sessionStorage.setItem('keycloak_redirect_attempted', 'true');
        setInitialized(true);
      });

    return () => {
      // Don't cleanup - singleton pattern
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(() => {
    if (keycloak) {
      keycloak.login({
        redirectUri: window.location.href,
      });
    }
  }, [keycloak]);

  const logout = useCallback(() => {
    if (keycloak) {
      setIsLoggingOut(true);
      sessionStorage.setItem('keycloak_logging_out', 'true');
      clearAuth();
      keycloak.logout({
        redirectUri: window.location.origin,
      });
    }
  }, [keycloak, clearAuth]);

  return (
    <KeycloakContext.Provider
      value={{
        keycloak,
        initialized,
        authenticated,
        isLoggingOut,
        login,
        logout,
        token: keycloak?.token,
      }}
    >
      {children}
    </KeycloakContext.Provider>
  );
}
