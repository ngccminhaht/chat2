'use client';

import { Box, Paper, Typography } from '@mui/material';
import WidgetTab from '@/features/settings/components/WidgetTab';

export default function WidgetPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Chat Widget
        </Typography>
        <WidgetTab />
      </Paper>
    </Box>
  );
}
