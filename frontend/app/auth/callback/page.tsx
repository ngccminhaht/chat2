'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { initialized, authenticated } = useKeycloak();
  const organization = useAuthStore((state) => state.organization);

  useEffect(() => {
    if (!initialized) return;

    if (authenticated) {
      // Redirect to dashboard or onboarding
      if (organization?.slug) {
        router.replace(`/organizations/${organization.slug}/conversations`);
      } else {
        router.replace('/create-organization');
      }
    } else {
      // Not authenticated, go to login
      router.replace('/login');
    }
  }, [initialized, authenticated, organization, router]);

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
