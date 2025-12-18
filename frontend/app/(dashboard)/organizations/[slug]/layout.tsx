'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Toolbar, CircularProgress } from '@mui/material';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useConversationWebSocketEvents } from '@/lib/websocket/useConversationWebSocketEvents';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useSwitchOrganization } from '@/features/auth/hooks/useSwitchOrganization';

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(true);

  const organizations = useAuthStore((state) => state.organizations);
  const currentOrg = useAuthStore((state) => state.organization);
  const accessToken = useAuthStore((state) => state.accessToken);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const switchOrg = useSwitchOrganization();

  // Setup WebSocket event listeners
  useConversationWebSocketEvents();

  // Validate org slug and switch if needed
  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage
    if (!hasHydrated) return;

    if (!accessToken) {
      router.replace('/login');
      return;
    }

    const targetOrg = organizations.find((org) => org.slug === slug);

    if (!targetOrg) {
      // Org not found - redirect to selector
      router.replace('/organizations');
      return;
    }

    // If current org doesn't match slug, switch to it
    if (currentOrg?.slug !== slug) {
      switchOrg.mutate(
        { organizationId: targetOrg.id },
        {
          onSuccess: () => setIsValidating(false),
          onError: () => router.replace('/organizations'),
        }
      );
    } else {
      setIsValidating(false);
    }
  }, [slug, organizations, currentOrg, accessToken, hasHydrated, router, switchOrg]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  if (isValidating) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Header onMenuClick={handleDrawerToggle} />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={handleDrawerToggle} orgSlug={slug} />
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
