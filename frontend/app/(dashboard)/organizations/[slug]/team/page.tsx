'use client';

import { Box, Paper } from '@mui/material';
import OrganizationMembers from '@/features/organizations/components/OrganizationMembers';

export default function TeamPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <OrganizationMembers />
      </Paper>
    </Box>
  );
}
