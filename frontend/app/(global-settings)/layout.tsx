'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Toolbar, Container } from '@mui/material';
import Header from '@/components/layout/Header';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';

export default function GlobalSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { initialized, authenticated, login } = useKeycloak();
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    // Wait for Keycloak init and Zustand hydration
    if (!initialized || !hasHydrated) return;

    // Auth check - trigger Keycloak login if not authenticated
    if (!authenticated) {
      login();
    }
  }, [initialized, authenticated, hasHydrated, login]);

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
