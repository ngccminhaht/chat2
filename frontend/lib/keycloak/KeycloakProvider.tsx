'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { useAuthStore } from '@/features/auth/stores/authStore';
import apiClient from '@/lib/api/client';

interface KeycloakContextType {
  keycloak: Keycloak | null;
  initialized: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
  token: string | undefined;
}

const KeycloakContext = createContext<KeycloakContextType>({
  keycloak: null,
  initialized: false,
  authenticated: false,
  login: () => {},
  logout: () => {},
  token: undefined,
});

export const useKeycloak = () => useContext(KeycloakContext);

interface KeycloakProviderProps {
  children: ReactNode;
}

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    const kc = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || '',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || '',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
    });

    kc.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: typeof window !== 'undefined'
        ? `${window.location.origin}/silent-check-sso.html`
        : undefined,
      pkceMethod: 'S256',
    })
      .then((auth) => {
        console.log('[Keycloak] Initialized, authenticated:', auth);
        setKeycloak(kc);
        setInitialized(true);
        setAuthenticated(auth);

        if (auth && kc.token) {
          // Set token in API client
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${kc.token}`;

          // Extract user info from token
          const tokenParsed = kc.tokenParsed as any;
          if (tokenParsed) {
            const user = {
              id: tokenParsed.sub,
              email: tokenParsed.email,
              name: tokenParsed.name || tokenParsed.preferred_username,
              avatarUrl: tokenParsed.picture || null,
            };

            // Set auth store with Keycloak token
            // Note: No backend session tokens needed anymore
            setAuth(
              user,
              kc.token,
              kc.refreshToken || '',
              tokenParsed.organizationId || '',
              tokenParsed.organization || null,
              tokenParsed.organizations || [],
            );
          }

          // Setup token refresh
          setupTokenRefresh(kc);
        }
      })
      .catch((error) => {
        console.error('[Keycloak] Init failed:', error);
        setInitialized(true);
      });

    return () => {
      // Cleanup if needed
    };
  }, [setAuth]);

  const setupTokenRefresh = (kc: Keycloak) => {
    // Refresh token when expired
    kc.onTokenExpired = () => {
      console.log('[Keycloak] Token expired, refreshing...');
      kc.updateToken(30)
        .then((refreshed) => {
          if (refreshed && kc.token) {
            console.log('[Keycloak] Token refreshed');
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${kc.token}`;
          }
        })
        .catch(() => {
          console.error('[Keycloak] Failed to refresh token');
          clearAuth();
        });
    };

    // Periodic refresh every minute
    const refreshInterval = setInterval(() => {
      if (kc.authenticated) {
        kc.updateToken(300).catch(() => {
          console.error('[Keycloak] Periodic refresh failed');
        });
      }
    }, 60000);

    return () => clearInterval(refreshInterval);
  };

  const login = useCallback(() => {
    if (keycloak) {
      keycloak.login({
        redirectUri: window.location.origin + '/auth/callback',
      });
    }
  }, [keycloak]);

  const logout = useCallback(() => {
    if (keycloak) {
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
        login,
        logout,
        token: keycloak?.token,
      }}
    >
      {children}
    </KeycloakContext.Provider>
  );
}
