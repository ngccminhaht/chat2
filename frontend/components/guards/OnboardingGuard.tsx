'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

// Routes that don't require organization
const ONBOARDING_ROUTES = [
  '/create-organization',
  '/connect-platforms',
  '/invite-members',
  '/organizations/new',
];

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  const { initialized, authenticated, login } = useKeycloak();
  const { organizationId, organizations, _hasHydrated } = useAuthStore();
  const hasOrganization = organizationId || (organizations && organizations.length > 0);

  useEffect(() => {
    // Wait for both Keycloak init and store hydration
    if (!initialized || !_hasHydrated) {
      return;
    }

    const isOnboardingRoute = ONBOARDING_ROUTES.some((route) => pathname.startsWith(route));

    // Not authenticated - trigger Keycloak login immediately
    if (!authenticated) {
      login();
      return;
    }

    // Authenticated but no organization - redirect to onboarding
    if (!hasOrganization) {
      if (!isOnboardingRoute) {
        router.replace('/organizations/new');
      }
      setIsChecking(false);
      return;
    }

    // Has organization - redirect away from onboarding routes
    if (isOnboardingRoute) {
      router.replace('/organizations');
      return;
    }

    // All checks passed - render children
    setIsChecking(false);
  }, [initialized, authenticated, hasOrganization, _hasHydrated, pathname, router, login]);

  // Always render children to preserve hook order in child components
  // Use overlay to hide content while checking
  return (
    <>
      {isChecking && (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bgcolor="background.default"
          zIndex={9999}
        >
          <CircularProgress />
        </Box>
      )}
      <Box sx={{ visibility: isChecking ? 'hidden' : 'visible' }}>
        {children}
      </Box>
    </>
  );
}
