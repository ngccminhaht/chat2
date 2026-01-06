'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';

interface Props {
  children: React.ReactNode;
}

export default function OrganizationGuard({ children }: Props) {
  const router = useRouter();
  const { initialized, authenticated, login } = useKeycloak();
  const organizationId = useAuthStore((state) => state.organizationId);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for Keycloak init and Zustand hydration
    if (!initialized || !hasHydrated) return;

    // Not authenticated - trigger Keycloak login
    if (!authenticated) {
      login();
      return;
    }

    // Authenticated but no organization - redirect to org selector
    if (!organizationId) {
      router.replace('/organizations');
      return;
    }

    setIsChecking(false);
  }, [initialized, authenticated, organizationId, hasHydrated, router, login]);

  // Show loading while checking auth state
  if (isChecking || !organizationId) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return <>{children}</>;
}
