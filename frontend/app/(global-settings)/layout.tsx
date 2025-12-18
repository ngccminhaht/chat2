'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Toolbar, Container } from '@mui/material';
import Header from '@/components/layout/Header';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function GlobalSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage
    if (!hasHydrated) return;

    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, hasHydrated, router]);

  const handleBack = () => {
    if (organization?.slug) {
      router.push(`/organizations/${organization.slug}/conversations`);
    } else {
      router.push('/organizations');
    }
  };

  return (
    <Box>
      <Header
        title="Settings"
        showBackButton
        onBackClick={handleBack}
        showMenuButton={false}
      />
      <Box component="main">
        <Toolbar />
        <Container maxWidth="md" sx={{ py: 3 }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
