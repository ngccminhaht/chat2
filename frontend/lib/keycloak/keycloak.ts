import Keycloak from 'keycloak-js';

/**
 * Keycloak Configuration and Initialization
 *
 * Usage:
 * 1. Import keycloakInstance
 * 2. Call initKeycloak() in your app
 * 3. Use keycloakInstance.token to get access token
 * 4. Send token in Authorization header to backend
 */

// Keycloak instance (singleton)
export const keycloakInstance = new Keycloak({
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || '',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
});

/**
 * Initialize Keycloak
 * Call this once when app starts
 */
export async function initKeycloak(): Promise<boolean> {
  try {
    const authenticated = await keycloakInstance.init({
      onLoad: 'check-sso', // Check if already logged in
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      pkceMethod: 'S256', // Use PKCE for security
    });

    if (authenticated) {
      console.log('[Keycloak] User is authenticated');
      // Auto-refresh token before expiry
      setupTokenRefresh();
    } else {
      console.log('[Keycloak] User is not authenticated');
    }

    return authenticated;
  } catch (error) {
    console.error('[Keycloak] Failed to initialize:', error);
    return false;
  }
}

/**
 * Login with Keycloak
 * Redirects to Keycloak login page
 */
export function loginWithKeycloak() {
  keycloakInstance.login({
    redirectUri: window.location.origin + '/auth/callback',
  });
}

/**
 * Logout from Keycloak
 */
export function logoutFromKeycloak() {
  keycloakInstance.logout({
    redirectUri: window.location.origin,
  });
}

/**
 * Get current access token
 */
export function getKeycloakToken(): string | undefined {
  return keycloakInstance.token;
}

/**
 * Check if user is authenticated
 */
export function isKeycloakAuthenticated(): boolean {
  return keycloakInstance.authenticated || false;
}

/**
 * Setup auto token refresh
 */
function setupTokenRefresh() {
  // Refresh token 30 seconds before expiry
  keycloakInstance.onTokenExpired = () => {
    console.log('[Keycloak] Token expired, refreshing...');
    keycloakInstance
      .updateToken(30)
      .then((refreshed) => {
        if (refreshed) {
          console.log('[Keycloak] Token refreshed');
        } else {
          console.log('[Keycloak] Token not refreshed, still valid');
        }
      })
      .catch(() => {
        console.error('[Keycloak] Failed to refresh token, logging out');
        logoutFromKeycloak();
      });
  };

  // Also setup periodic refresh (every 5 minutes)
  setInterval(() => {
    if (keycloakInstance.authenticated) {
      keycloakInstance
        .updateToken(300) // Refresh if expires in 5 minutes
        .catch(() => {
          console.error('[Keycloak] Token refresh failed');
        });
    }
  }, 60000); // Check every minute
}

/**
 * Get user info from token
 */
export function getKeycloakUserInfo() {
  if (!keycloakInstance.tokenParsed) return null;

  return {
    sub: keycloakInstance.tokenParsed.sub,
    email: keycloakInstance.tokenParsed.email,
    name: keycloakInstance.tokenParsed.name || keycloakInstance.tokenParsed.preferred_username,
    roles: keycloakInstance.tokenParsed.realm_access?.roles || [],
  };
}
