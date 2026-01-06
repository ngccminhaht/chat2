'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { initialized, authenticated, keycloak } = useKeycloak();
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const redirectAttempted = useRef(false);

  useEffect(() => {
    if (!initialized || !hasHydrated) return;
    // Prevent multiple redirects
    if (redirectAttempted.current) return;

    // Check if URL has auth code (Keycloak callback)
    const hasAuthCode = window.location.hash.includes('code=') ||
                        window.location.search.includes('code=');

    // If we have auth code but not authenticated yet, wait for Keycloak to process
    if (hasAuthCode && !authenticated) {
      console.log('[AuthCallback] Has auth code, waiting for Keycloak to process...');
      return;
    }

    if (authenticated) {
      redirectAttempted.current = true;
      // Redirect to dashboard or onboarding
      if (organization?.slug) {
        router.replace(`/organizations/${organization.slug}/conversations`);
      } else {
        router.replace('/organizations/new');
      }
    } else {
      // Only redirect to login if definitely not authenticated and no auth code
      redirectAttempted.current = true;
      console.log('[AuthCallback] Not authenticated, redirecting to login');
      router.replace('/login');
    }
  }, [initialized, authenticated, organization, hasHydrated, router, keycloak]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      gap={2}
    >
      <CircularProgress />
      <Typography color="text.secondary">
        Processing authentication...
      </Typography>
    </Box>
  );
}
