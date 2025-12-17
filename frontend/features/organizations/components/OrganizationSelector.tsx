'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Grid, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useSwitchOrganization } from '@/features/auth/hooks/useSwitchOrganization';
import OrganizationCard from './OrganizationCard';
import EmptyOrganizationState from './EmptyOrganizationState';

export default function OrganizationSelector() {
  const router = useRouter();
  const organizations = useAuthStore((state) => state.organizations);
  const switchOrg = useSwitchOrganization();
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  const handleSelectOrg = (orgId: string) => {
    setSwitchingOrgId(orgId);
    switchOrg.mutate(
      { organizationId: orgId },
      {
        onSuccess: () => router.push('/conversations'),
        onError: () => setSwitchingOrgId(null),
      }
    );
  };

  if (organizations.length === 0) {
    return <EmptyOrganizationState />;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4">Select Organization</Typography>
          <Typography variant="body1" color="text.secondary">
            Choose an organization to continue
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => router.push('/organizations/new')}
        >
          Create New
        </Button>
      </Box>

      {switchOrg.isError && (
        <Box mb={2}>
          <Alert severity="error">
            Failed to switch organization. Please try again.
          </Alert>
        </Box>
      )}

      <Grid container spacing={2}>
        {organizations.map((org) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={org.id}>
            <OrganizationCard
              organization={org}
              onClick={() => handleSelectOrg(org.id)}
              loading={switchingOrgId === org.id}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
