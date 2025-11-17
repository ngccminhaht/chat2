'use client';

import { Box, Typography, Grid, Alert, CircularProgress } from '@mui/material';
import { usePlatformConnections, useDeletePlatformConnection } from '@/features/platform-connections/hooks/usePlatformConnections';
import PlatformConnectionCard from '@/features/platform-connections/components/PlatformConnectionCard';
import ConnectPlatformButton from '@/features/platform-connections/components/ConnectPlatformButton';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: connections, isLoading, error } = usePlatformConnections();
  const deleteMutation = useDeletePlatformConnection();
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

  const handleDisconnect = async (connectionId: string) => {
    if (confirm('Are you sure you want to disconnect this platform?')) {
      try {
        await deleteMutation.mutateAsync(connectionId);
        setSuccessMessage('Platform disconnected successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error) {
        console.error('Failed to disconnect platform:', error);
      }
    }
  };

  // Show all platforms - allow multiple accounts per platform
  const allPlatforms = ['zalo', 'facebook', 'tiktok', 'shopee'];

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
                <PlatformConnectionCard
                  connection={connection}
                  onDisconnect={handleDisconnect}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      ) : (
        <Alert severity="info">
          No platforms connected yet. Connect your first platform below!
        </Alert>
      )}

      {/* Available Platforms to Connect - Always show all platforms for multiple accounts */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Connect Platform
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          You can connect multiple accounts for each platform
        </Typography>
        <Grid container spacing={2}>
          {allPlatforms.map((platform) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={platform}>
              <ConnectPlatformButton
                platform={platform as 'facebook' | 'zalo' | 'tiktok' | 'shopee'}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
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
