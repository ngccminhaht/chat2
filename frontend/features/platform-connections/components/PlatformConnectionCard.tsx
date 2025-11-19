'use client';

import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  Avatar,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { PlatformConnection } from '../types/platform-connection.types';

interface PlatformConnectionCardProps {
  connection: PlatformConnection;
  onDisconnect?: (id: string) => void;
  onToggleStatus?: (id: string, newStatus: 'active' | 'inactive') => void;
}

const platformNames: Record<string, string> = {
  facebook: 'Facebook',
  zalo: 'Zalo OA',
  tiktok: 'TikTok Shop',
  shopee: 'Shopee',
};

export default function PlatformConnectionCard({
  connection,
  onDisconnect,
  onToggleStatus,
}: PlatformConnectionCardProps) {
  const statusColor =
    connection.status === 'active'
      ? 'success'
      : connection.status === 'expired'
        ? 'warning'
        : 'error';

  const isActive = connection.status === 'active';

  const handleToggle = () => {
    if (onToggleStatus) {
      const newStatus = isActive ? 'inactive' : 'active';
      onToggleStatus(connection.id, newStatus);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Avatar
            src={connection.metadata.avatar}
          >
            {platformNames[connection.platform]?.charAt(0)}
          </Avatar>
          <Box flex={1}>
            <Typography variant="h6">
              {connection.platformAccountName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {platformNames[connection.platform]}
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip label={connection.status} color={statusColor} size="small" />
            {onToggleStatus && (
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={handleToggle}
                    color="primary"
                    size="small"
                  />
                }
                label=""
              />
            )}
          </Box>
        </Box>

        {connection.metadata.description && (
          <Typography variant="body2" color="text.secondary" mb={2}>
            {connection.metadata.description}
          </Typography>
        )}

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Last synced:{' '}
            {connection.lastSyncAt
              ? new Date(connection.lastSyncAt).toLocaleDateString()
              : 'Never'}
          </Typography>
          {onDisconnect && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => onDisconnect(connection.id)}
            >
              Disconnect
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
