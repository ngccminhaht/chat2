'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Container, Typography, CircularProgress, Alert } from '@mui/material';
import apiClient from '@/lib/api/client';

function ShopeeCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string>('');

  useEffect(() => {
    const tempId = searchParams.get('temp_id');
    const shopNameParam = searchParams.get('shop_name');

    if (shopNameParam) {
      setShopName(shopNameParam);
    }

    if (!tempId) {
      setError('Missing temporary ID. Please try connecting again.');
      return;
    }

    // Complete the OAuth flow by calling backend
    const completeConnection = async () => {
      try {
        await apiClient.get(`/platform-connections/shopee/complete`, {
          params: { temp_id: tempId },
        });

        // Success - redirect to platform connections page
        setTimeout(() => {
          router.push('/platform-connections?status=success&platform=shopee');
        }, 1500);
      } catch (err: any) {
        console.error('Failed to complete Shopee connection:', err);
        setError(
          err.response?.data?.message ||
            'Failed to complete connection. Please try again.'
        );
      }
    };

    completeConnection();
  }, [searchParams, router]);

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
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Please return to{' '}
              <a href="/platform-connections">Platform Connections</a> and try
              again.
            </Typography>
          </>
        ) : (
          <>
            <CircularProgress size={60} />
            <Typography variant="h5" textAlign="center">
              Completing Shopee Connection
            </Typography>
            {shopName && (
              <Typography variant="body1" color="text.secondary" textAlign="center">
                Shop: {shopName}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Please wait while we finalize your connection...
            </Typography>
          </>
        )}
      </Box>
    </Container>
  );
}

export default function ShopeeCompletePage() {
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
      <ShopeeCompleteContent />
    </Suspense>
  );
}
