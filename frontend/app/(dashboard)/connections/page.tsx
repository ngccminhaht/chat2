'use client';

import { Box, Typography, Grid, Alert, CircularProgress } from '@mui/material';
import { usePlatformConnections } from '@/features/platform-connections/hooks/usePlatformConnections';
import PlatformConnectionCard from '@/features/platform-connections/components/PlatformConnectionCard';
import ConnectPlatformButton from '@/features/platform-connections/components/ConnectPlatformButton';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: connections, isLoading, error } = usePlatformConnections();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if OAuth callback with success status
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const account = searchParams.get('account');

    if (status === 'success' && platform) {
      setSuccessMessage(
        `Successfully connected ${platform}${account ? `: ${account}` : ''}!`
      );

      // Refetch connections to show the new one
      queryClient.invalidateQueries({ queryKey: ['platform-connections'] });

      // Clear URL params after showing message
      window.history.replaceState({}, '', '/connections');

      // Auto-hide message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  }, [searchParams, queryClient]);

  const connectedPlatforms = connections?.map((c) => c.platform) || [];
  const availablePlatforms = ['zalo', 'facebook', 'tiktok', 'shopee'].filter(
    (p) => !connectedPlatforms.includes(p as any)
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Platform Connections
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Connect your social media and e-commerce platforms to manage all
        conversations in one place.
      </Typography>

      {successMessage && (
        <Alert severity="success">
          {successMessage}
        </Alert>
      )}

      {/* Connected Platforms */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">
          Failed to load connections
        </Alert>
      ) : connections && connections.length > 0 ? (
        <Box mb={4}>
          <Typography variant="h6" gutterBottom>
            Connected Platforms
          </Typography>
          <Grid container spacing={2}>
            {connections.map((connection) => (
              <Grid size={{ xs: 12, md: 6 }} key={connection.id}>
                <PlatformConnectionCard connection={connection} />
              </Grid>
            ))}
          </Grid>
        </Box>
      ) : (
        <Alert severity="info">
          No platforms connected yet. Connect your first platform below!
        </Alert>
      )}

      {/* Available Platforms to Connect */}
      {availablePlatforms.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Connect New Platform
          </Typography>
          <Grid container spacing={2}>
            {availablePlatforms.map((platform) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={platform}>
                <ConnectPlatformButton
                  platform={platform as 'facebook' | 'zalo' | 'tiktok' | 'shopee'}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      }
    >
      <ConnectionsPageContent />
    </Suspense>
  );
}
