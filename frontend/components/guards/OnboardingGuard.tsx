'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

// Routes for first-time onboarding (redirect away if user has org)
const FIRST_TIME_ONBOARDING_ROUTES = [
  '/create-organization',
  '/connect-platforms',
  '/invite-members',
];

// Routes that don't require organization
const NO_ORG_REQUIRED_ROUTES = [
  ...FIRST_TIME_ONBOARDING_ROUTES,
  '/organizations/new',  // Allow creating additional organizations
];

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  const { initialized, authenticated, isLoggingOut, isLoadingOrganizations, login } = useKeycloak();
  const { organizationId, organizations, _hasHydrated } = useAuthStore();
  const hasOrganization = organizationId || (organizations && organizations.length > 0);

  // Check logout flag synchronously BEFORE any useEffect runs
  // This prevents flash of onboarding page during logout redirect
  const isLoggingOutSession = typeof window !== 'undefined'
    && sessionStorage.getItem('keycloak_logging_out') === 'true';

  useEffect(() => {
    // Skip all checks while logging out - Keycloak will handle redirect
    if (isLoggingOut || isLoggingOutSession) {
      return;
    }

    // Wait for both Keycloak init and store hydration
    if (!initialized || !_hasHydrated) {
      return;
    }

    const isNoOrgRequiredRoute = NO_ORG_REQUIRED_ROUTES.some((route) => pathname.startsWith(route));
    const isFirstTimeOnboardingRoute = FIRST_TIME_ONBOARDING_ROUTES.some((route) => pathname.startsWith(route));

    // Not authenticated - trigger Keycloak login immediately
    if (!authenticated) {
      login();
      return;
    }

    // Wait for organizations to finish loading before checking
    if (isLoadingOrganizations) {
      return;
    }

    // Authenticated but no organization - redirect to onboarding
    if (!hasOrganization) {
      if (!isNoOrgRequiredRoute) {
        router.replace('/organizations/new');
      }
      setIsChecking(false);
      return;
    }

    // Has organization - redirect away from first-time onboarding routes only
    // Allow /organizations/new for creating additional organizations
    if (isFirstTimeOnboardingRoute) {
      router.replace('/organizations');
      return;
    }

    // All checks passed - render children
    setIsChecking(false);
  }, [initialized, authenticated, isLoggingOut, isLoggingOutSession, isLoadingOrganizations, hasOrganization, _hasHydrated, pathname, router, login]);

  // Show loading during logout to prevent flash of onboarding page
  const showLoading = isChecking || isLoggingOut || isLoggingOutSession;

  // Always render children to preserve hook order in child components
  // Use overlay to hide content while checking
  return (
    <>
      {showLoading && (
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
      <Box sx={{ visibility: showLoading ? 'hidden' : 'visible' }}>
        {children}
      </Box>
    </>
  );
}
