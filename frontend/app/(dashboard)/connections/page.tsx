'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { Suspense } from 'react';

function ConnectionsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve query params for OAuth callbacks
    const params = searchParams.toString();
    const redirectUrl = params
      ? `/integrations/connections?${params}`
      : '/integrations/connections';
    router.replace(redirectUrl);
  }, [router, searchParams]);

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <CircularProgress />
    </Box>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
        </Box>
      }
    >
      <ConnectionsRedirect />
    </Suspense>
  );
}
