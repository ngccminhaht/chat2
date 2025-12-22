'use client';

import { Box, Typography } from '@mui/material';
import AIAgentTab from '@/features/settings/components/AIAgentTab';

export default function AIAgentPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        AI Agent
      </Typography>
      <AIAgentTab />
    </Box>
  );
}
