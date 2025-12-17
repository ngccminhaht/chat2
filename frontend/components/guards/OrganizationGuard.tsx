'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface Props {
  children: React.ReactNode;
}

export default function OrganizationGuard({ children }: Props) {
  const router = useRouter();
  const organizationId = useAuthStore((state) => state.organizationId);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for hydration from persisted store
    const timer = setTimeout(() => {
      if (!accessToken) {
        router.replace('/login');
        return;
      }

      if (!organizationId) {
        router.replace('/organizations');
        return;
      }

      setIsChecking(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [organizationId, accessToken, router]);

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
