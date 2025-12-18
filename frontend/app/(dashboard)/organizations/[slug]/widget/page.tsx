'use client';

import { Box, Typography } from '@mui/material';
import WidgetTab from '@/features/settings/components/WidgetTab';

export default function WidgetPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Web Widget
      </Typography>
      <WidgetTab />
    </Box>
  );
}
