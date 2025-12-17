'use client';

import { Suspense, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import {
  usePlatformConnections,
  useDeletePlatformConnection,
  useUpdatePlatformConnectionStatus,
} from '@/features/connections/hooks/usePlatformConnections';
import PlatformConnectionCard from '@/features/connections/components/PlatformConnectionCard';
import ConnectPlatformButton from '@/features/connections/components/ConnectPlatformButton';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ConnectionStatus } from '@/lib/constants';

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: connections, isLoading, error } = usePlatformConnections();
  const deleteMutation = useDeletePlatformConnection();
  const updateStatusMutation = useUpdatePlatformConnectionStatus();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const allPlatforms = ['zalo', 'facebook', 'tiktok', 'shopee'];
  const [selectedTab, setSelectedTab] = useState<string>(allPlatforms[0]);

  useEffect(() => {
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const account = searchParams.get('account');
    const action = searchParams.get('action');

    if (status === 'success' && platform) {
      const actionText = action === 'synced' ? 'synced' : 'connected';
      setSuccessMessage(
        `Successfully ${actionText} ${platform}${account ? `: ${account}` : ''}!`
      );
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      window.history.replaceState({}, '', '/integrations/connections');
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

  const handleToggleStatus = async (connectionId: string, newStatus: ConnectionStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ connectionId, status: newStatus });
      setSuccessMessage(
        `Platform ${newStatus === ConnectionStatus.ACTIVE ? 'activated' : 'deactivated'} successfully!`
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to update platform status:', error);
    }
  };

  const filteredConnections = connections?.filter((conn) => conn.platform === selectedTab);

  const platformCounts = allPlatforms.reduce(
    (acc, platform) => {
      acc[platform] = connections?.filter((conn) => conn.platform === platform).length || 0;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Platform Connections
        </Typography>

        {successMessage && (
          <Box mb={2}>
            <Alert severity="success">{successMessage}</Alert>
          </Box>
        )}

        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Box flexGrow={1}>
              <Tabs
                value={selectedTab}
                onChange={(_, newValue) => setSelectedTab(newValue)}
                variant="scrollable"
              >
                {allPlatforms.map((platform) => (
                  <Tab
                    key={platform}
                    label={`${platform.charAt(0).toUpperCase() + platform.slice(1)} (${platformCounts[platform]})`}
                    value={platform}
                  />
                ))}
              </Tabs>
            </Box>
            <ConnectPlatformButton
              platform={selectedTab as 'facebook' | 'zalo' | 'tiktok' | 'shopee'}
            />
          </Box>
        </Box>

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load connections</Alert>
        ) : filteredConnections && filteredConnections.length > 0 ? (
          <Box display="flex" flexWrap="wrap" gap={2}>
            {filteredConnections.map((connection) => (
              <Box key={connection.id} sx={{ width: { xs: '100%', md: 'calc(50% - 8px)' } }}>
                <PlatformConnectionCard
                  connection={connection}
                  onDisconnect={handleDisconnect}
                  onToggleStatus={handleToggleStatus}
                />
              </Box>
            ))}
          </Box>
        ) : (
          <Alert severity="info">
            No {selectedTab} connections yet. Use the connect button above!
          </Alert>
        )}
      </Paper>
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
