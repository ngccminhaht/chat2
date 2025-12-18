'use client';

import { useState } from 'react';
import { Box, Paper, Tabs, Tab, Typography, Stack } from '@mui/material';
import OrganizationMembers from '@/features/organizations/components/OrganizationMembers';
import AiAgentsTab from './AiAgentsTab';

export default function TeamPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 3, pt: 2 }}>
          <Typography variant="h5">Members</Typography>
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
          <Tab label="Members" />
          <Tab label="AI Agents" />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {tab === 0 && <OrganizationMembers />}
          {tab === 1 && <AiAgentsTab />}
        </Box>
      </Paper>
    </Box>
  );
}
