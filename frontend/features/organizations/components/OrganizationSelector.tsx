'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Box, Typography, Button, Grid } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAuthStore } from '@/features/auth/stores/authStore';
import OrganizationCard from './OrganizationCard';
import EmptyOrganizationState from './EmptyOrganizationState';

export default function OrganizationSelector() {
  const router = useRouter();
  const t = useTranslations();
  const organizations = useAuthStore((state) => state.organizations);
  const setOrganizations = useAuthStore((state) => state.setOrganizations);

  const handleSelectOrg = (orgId: string, orgSlug: string) => {
    // Update current org in store and navigate
    const org = organizations.find((o) => o.id === orgId);
    if (org) {
      setOrganizations(orgId, { id: org.id, name: org.name, slug: org.slug, plan: org.plan }, organizations);
      router.push(`/organizations/${orgSlug}/conversations`);
    }
  };

  if (organizations.length === 0) {
    return <EmptyOrganizationState />;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4">{t('organizations.select')}</Typography>
          <Typography variant="body1" color="text.secondary">
            Choose an organization to continue
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => router.push('/organizations/new')}
        >
          {t('organizations.createNew')}
        </Button>
      </Box>

      <Grid container spacing={2}>
        {organizations.map((org) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={org.id}>
            <OrganizationCard
              organization={org}
              onClick={() => handleSelectOrg(org.id, org.slug)}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
