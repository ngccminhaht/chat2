'use client';

import { Box, Paper, Typography } from '@mui/material';
import QuickRepliesTab from '@/features/settings/components/QuickRepliesTab';

export default function QuickRepliesPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper className="settings-form-panel" sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Quick Replies
        </Typography>
        <QuickRepliesTab />
      </Paper>
    </Box>
  );
}
