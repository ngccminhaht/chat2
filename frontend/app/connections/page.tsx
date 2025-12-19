'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Container, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { CheckCircle as SuccessIcon, Error as ErrorIcon } from '@mui/icons-material';
import { useAuthStore } from '@/features/auth/stores/authStore';

function ConnectionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const [redirecting, setRedirecting] = useState(false);

  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const account = searchParams.get('account');
  const error = searchParams.get('error');

  useEffect(() => {
    if (!hasHydrated) return;

    // Redirect to channels page after showing success/error message
    const timer = setTimeout(() => {
      setRedirecting(true);
      if (organization?.slug) {
        router.push(`/organizations/${organization.slug}/channels`);
      } else {
        router.push('/organizations');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasHydrated, organization, router]);

  const handleRedirectNow = () => {
    setRedirecting(true);
    if (organization?.slug) {
      router.push(`/organizations/${organization.slug}/channels`);
    } else {
      router.push('/organizations');
    }
  };

  const isSuccess = status === 'success';
  const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Platform';

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        gap={3}
      >
        {error ? (
          <>
            <ErrorIcon color="error" sx={{ fontSize: 60 }} />
            <Typography variant="h5" textAlign="center">
              Connection Failed
            </Typography>
            <Alert severity="error" sx={{ width: '100%' }}>
              {decodeURIComponent(error)}
            </Alert>
          </>
        ) : isSuccess ? (
          <>
            <SuccessIcon color="success" sx={{ fontSize: 60 }} />
            <Typography variant="h5" textAlign="center">
              {platformName} Connected Successfully
            </Typography>
            {account && (
              <Typography variant="body1" color="text.secondary" textAlign="center">
                Account: {decodeURIComponent(account)}
              </Typography>
            )}
          </>
        ) : (
          <>
            <CircularProgress size={60} />
            <Typography variant="h5" textAlign="center">
              Processing Connection
            </Typography>
          </>
        )}

        {redirecting ? (
          <Box display="flex" alignItems="center" gap={1}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Redirecting to channels...
            </Typography>
          </Box>
        ) : (
          <Button variant="text" onClick={handleRedirectNow}>
            Go to Channels
          </Button>
        )}
      </Box>
    </Container>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="sm">
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            minHeight="100vh"
            gap={3}
          >
            <CircularProgress size={60} />
            <Typography variant="h5" textAlign="center">
              Loading...
            </Typography>
          </Box>
        </Container>
      }
    >
      <ConnectionsContent />
    </Suspense>
  );
}
