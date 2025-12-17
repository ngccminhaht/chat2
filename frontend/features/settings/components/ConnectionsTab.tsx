'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  CardActions,
  Avatar,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Facebook as FacebookIcon,
  Chat as ZaloIcon,
  ShoppingBag as ShopeeIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import {
  usePlatformConnections,
  useDeletePlatformConnection,
  useUpdatePlatformConnectionStatus,
} from '@/features/connections/hooks/usePlatformConnections';
import { PlatformConnection } from '@/features/connections/types/platform-connection.types';
import { ConnectionStatus } from '@/lib/constants/statuses';
import { useRouter } from 'next/navigation';

// Platform icon mapping
const platformIcons: Record<string, React.ReactNode> = {
  facebook: <FacebookIcon sx={{ color: '#1877F2' }} />,
  zalo: <ZaloIcon sx={{ color: '#0068ff' }} />,
  tiktok: <ShopeeIcon sx={{ color: '#000' }} />,
  shopee: <ShopeeIcon sx={{ color: '#ee4d2d' }} />,
};

// Platform colors
const platformColors: Record<string, 'primary' | 'info' | 'secondary' | 'error'> = {
  facebook: 'primary',
  zalo: 'info',
  tiktok: 'secondary',
  shopee: 'error',
};

export default function ConnectionsTab() {
  const router = useRouter();
  const { data: connections, isLoading } = usePlatformConnections();
  const deleteConnection = useDeletePlatformConnection();
  const updateStatus = useUpdatePlatformConnectionStatus();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<PlatformConnection | null>(null);

  const handleDelete = (connection: PlatformConnection) => {
    setConnectionToDelete(connection);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (connectionToDelete) {
      deleteConnection.mutate(connectionToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setConnectionToDelete(null);
        },
      });
    }
  };

  const handleToggleStatus = (connection: PlatformConnection) => {
    const newStatus =
      connection.status === ConnectionStatus.ACTIVE
        ? ConnectionStatus.INACTIVE
        : ConnectionStatus.ACTIVE;
    updateStatus.mutate({ connectionId: connection.id, status: newStatus });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Platform Connections</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => router.push('/integrations/connections')}
        >
          Add Connection
        </Button>
      </Stack>

      <Alert severity="info">
        Manage your connected platforms. Each connection allows you to receive and send messages.
      </Alert>

      {isLoading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {connections?.map((connection) => (
            <Card key={connection.id} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Avatar sx={{ bgcolor: 'background.default' }}>
                    {platformIcons[connection.platform] || <FacebookIcon />}
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle1" fontWeight="bold">
                        {connection.platformAccountName}
                      </Typography>
                      <Chip
                        label={connection.platform}
                        size="small"
                        color={platformColors[connection.platform] || 'default'}
                        variant="outlined"
                      />
                      <Chip
                        label={connection.status}
                        size="small"
                        color={connection.status === 'active' ? 'success' : 'warning'}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      ID: {connection.platformAccountId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                      Connected: {formatDate(connection.createdAt)} | Last sync:{' '}
                      {connection.lastSyncAt ? formatDate(connection.lastSyncAt) : 'Never'}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  onClick={() => handleToggleStatus(connection)}
                  disabled={updateStatus.isPending}
                >
                  {connection.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
                <IconButton size="small" disabled>
                  <RefreshIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(connection)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {!isLoading && (!connections || connections.length === 0) && (
        <Alert severity="info">
          No platform connections found. Connect a platform to start receiving messages.
        </Alert>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Connection</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the connection to &quot;
            {connectionToDelete?.platformAccountName}&quot;? You will stop receiving messages from
            this account.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deleteConnection.isPending}
          >
            {deleteConnection.isPending ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
