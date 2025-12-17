'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

// Routes that don't require organization
const ONBOARDING_ROUTES = [
  '/create-organization',
  '/connect-platforms',
  '/invite-members',
];

const AUTH_ROUTES = ['/login', '/register'];

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  const { isAuthenticated, organizationId, organizations } = useAuthStore();
  const hasOrganization = organizationId || (organizations && organizations.length > 0);

  useEffect(() => {
    const checkAuth = () => {
      const isAuth = isAuthenticated();
      const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
      const isOnboardingRoute = ONBOARDING_ROUTES.some((route) => pathname.startsWith(route));

      // Not authenticated - allow access to auth routes only
      if (!isAuth) {
        if (!isAuthRoute) {
          router.replace('/login');
        }
        setIsChecking(false);
        return;
      }

      // Authenticated but no organization - redirect to onboarding
      if (!hasOrganization) {
        if (!isOnboardingRoute) {
          router.replace('/create-organization');
        }
        setIsChecking(false);
        return;
      }

      // Has organization - redirect away from onboarding
      if (hasOrganization && isOnboardingRoute) {
        router.replace('/organizations');
        return;
      }

      // Authenticated with organization - redirect away from auth routes
      if (isAuthRoute) {
        router.replace('/organizations');
        return;
      }

      setIsChecking(false);
    };

    checkAuth();
  }, [isAuthenticated, hasOrganization, pathname, router]);

  if (isChecking) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return <>{children}</>;
}
