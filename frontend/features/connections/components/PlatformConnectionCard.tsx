"use client";

import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Avatar,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { PlatformConnection } from "../types/platform-connection.types";
import { PLATFORM_DISPLAY_NAMES, ConnectionStatus } from "@/lib/constants";

interface PlatformConnectionCardProps {
  connection: PlatformConnection;
  onDisconnect?: (id: string) => void;
  onToggleStatus?: (id: string, newStatus: ConnectionStatus) => void;
}

export default function PlatformConnectionCard({
  connection,
  onDisconnect,
  onToggleStatus,
}: PlatformConnectionCardProps) {
  const isActive = connection.status === ConnectionStatus.ACTIVE;

  const handleToggle = () => {
    if (onToggleStatus) {
      const newStatus = isActive ? ConnectionStatus.INACTIVE : ConnectionStatus.ACTIVE;
      onToggleStatus(connection.id, newStatus);
    }
  };

  const platformName = PLATFORM_DISPLAY_NAMES[connection.platform as keyof typeof PLATFORM_DISPLAY_NAMES] || connection.platform;

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Avatar src={connection.metadata.avatar}>
            {platformName.charAt(0)}
          </Avatar>
          <Box flex={1}>
            <Typography variant="h6">
              {connection.platformAccountName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {platformName}
            </Typography>
          </Box>
          {onToggleStatus && (
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={handleToggle}
                  color="primary"
                />
              }
              label=""
            />
          )}
        </Box>

        {connection.metadata.description && (
          <Typography variant="body2" color="text.secondary" mb={2}>
            {connection.metadata.description}
          </Typography>
        )}

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Last synced:{" "}
            {connection.lastSyncAt
              ? new Date(connection.lastSyncAt).toLocaleDateString()
              : "Never"}
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
