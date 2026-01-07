'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Toolbar, CircularProgress } from '@mui/material';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useTotalUnreadCount } from '@/features/conversations/stores/conversationStore';
import { useKeycloak } from '@/lib/keycloak/KeycloakProvider';

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

  const { initialized, authenticated, isLoadingOrganizations } = useKeycloak();
  const organizations = useAuthStore((state) => state.organizations);
  const currentOrg = useAuthStore((state) => state.organization);
  const setOrganizations = useAuthStore((state) => state.setOrganizations);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const unreadCount = useTotalUnreadCount();

  // Validate org slug and switch if needed
  useEffect(() => {
    // Wait for Keycloak init and Zustand hydration
    if (!initialized || !hasHydrated) return;

    // Auth check handled by OnboardingGuard
    if (!authenticated) return;

    // Wait for organizations to finish loading before validating slug
    if (isLoadingOrganizations) return;

    const targetOrg = organizations.find((org) => org.slug === slug);

    if (!targetOrg) {
      // Org not found - redirect to selector
      router.replace('/organizations');
      return;
    }

    // If current org doesn't match slug, update store
    if (currentOrg?.slug !== slug) {
      setOrganizations(
        targetOrg.id,
        { id: targetOrg.id, name: targetOrg.name, slug: targetOrg.slug, plan: targetOrg.plan },
        organizations
      );
    }

    setIsValidating(false);
  }, [slug, organizations, currentOrg, initialized, authenticated, isLoadingOrganizations, hasHydrated, router, setOrganizations]);

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
      <Header onMenuClick={handleDrawerToggle} currentOrgSlug={slug} />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={handleDrawerToggle} orgSlug={slug} unreadCount={unreadCount} />
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
