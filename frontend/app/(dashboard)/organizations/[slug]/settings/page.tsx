'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';

export default function SettingsPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => {
    router.replace(`/organizations/${slug}/settings/organization`);
  }, [router, slug]);

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <CircularProgress />
    </Box>
  );
}
