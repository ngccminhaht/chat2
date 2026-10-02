"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Paper,
  Tabs,
  Tab,
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
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  SmartToy as SmartToyIcon,
} from "@mui/icons-material";
import {
  usePlatformConnections,
  useDeletePlatformConnection,
  useUpdatePlatformConnectionStatus,
} from "@/features/connections/hooks/usePlatformConnections";
import { useConnectFacebook } from "@/features/connections/hooks/useConnectFacebook";
import { useConnectZalo } from "@/features/connections/hooks/useConnectZalo";
import { useConnectShopee } from "@/features/connections/hooks/useConnectShopee";
import { useConnectTelegram } from "@/features/connections/hooks/useConnectTelegram";
import TelegramConnectionDialog from "@/features/connections/components/TelegramConnectionDialog";
import { PlatformConnection } from "@/features/connections/types/platform-connection.types";
import ConnectionAISettingsDialog from "@/features/connections/components/ConnectionAISettingsDialog";
import { ConnectionStatus } from "@/lib/constants/statuses";
import { AVAILABLE_PLATFORMS, PLATFORM_DISPLAY_NAMES, Platform } from "@/lib/constants/platforms";

const PLATFORMS = AVAILABLE_PLATFORMS.map(p => ({
  id: p.id,
  name: PLATFORM_DISPLAY_NAMES[p.id as Platform],
}));

export default function ChannelsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get initial tab from query param
  const platformParam = searchParams.get("platform");
  const highlightId = searchParams.get("new");
  const initialTab = platformParam
    ? PLATFORMS.findIndex(p => p.id === platformParam)
    : 0;

  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0);
  const { data: connections, isLoading } = usePlatformConnections();
  const deleteConnection = useDeletePlatformConnection();
  const updateStatus = useUpdatePlatformConnectionStatus();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] =
    useState<PlatformConnection | null>(null);
  const [aiSettingsDialogOpen, setAiSettingsDialogOpen] = useState(false);
  const [connectionForAISettings, setConnectionForAISettings] =
    useState<PlatformConnection | null>(null);

  // OAuth connection hooks
  const { connectFacebook, isLoading: isLoadingFacebook, error: errorFacebook } =
    useConnectFacebook();
  const { connectZalo, isLoading: isLoadingZalo, error: errorZalo } = useConnectZalo();
  const { connectShopee, isLoading: isLoadingShopee, error: errorShopee } = useConnectShopee();
  const telegram = useConnectTelegram();

  const currentPlatform = PLATFORMS[tab].id;
  const platformConnections =
    connections?.filter((c) => c.platform === currentPlatform) || [];

  // Get current platform error
  const connectionError =
    currentPlatform === "facebook" ? errorFacebook :
    currentPlatform === "zalo" ? errorZalo :
    currentPlatform === "shopee" ? errorShopee :
    currentPlatform === "telegram" ? telegram.error : null;

  // Update URL query when tab changes
  const handleTabChange = (newTab: number) => {
    setTab(newTab);
    const platform = PLATFORMS[newTab].id;
    router.replace(`?platform=${platform}`, { scroll: false });
  };

  // Clear highlight param after showing
  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => {
        router.replace(`?platform=${currentPlatform}`, { scroll: false });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, currentPlatform, router]);

  const handleConnect = () => {
    if (currentPlatform === "facebook") {
      connectFacebook();
    } else if (currentPlatform === "zalo") {
      connectZalo();
    } else if (currentPlatform === "shopee") {
      connectShopee();
    } else if (currentPlatform === "telegram") {
      telegram.openDialog();
    } else if (currentPlatform === "tiktok") {
      alert("TikTok Shop connection coming soon!");
    }
  };

  const isConnecting = () => {
    if (currentPlatform === "facebook") return isLoadingFacebook;
    if (currentPlatform === "zalo") return isLoadingZalo;
    if (currentPlatform === "shopee") return isLoadingShopee;
    if (currentPlatform === "telegram") return telegram.isLoading;
    return false;
  };

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

  const handleOpenAISettings = (connection: PlatformConnection) => {
    setConnectionForAISettings(connection);
    setAiSettingsDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Box className="channels-page" sx={{ height: "calc(100vh - 112px)", overflow: "auto" }}>
      <Typography className="channels-page-title" variant="h5" sx={{ mb: 2 }}>
        Channels
      </Typography>
      <Paper className="channels-panel" variant="outlined">
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ pr: 2 }}
          >
            <Tabs value={tab} onChange={(_, v) => handleTabChange(v)}>
              {PLATFORMS.map((platform) => (
                <Tab key={platform.id} label={platform.name} />
              ))}
            </Tabs>
            <Button
              variant="contained"
              size="small"
              startIcon={
                isConnecting() ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AddIcon />
                )
              }
              onClick={handleConnect}
              disabled={isConnecting()}
            >
              Connect {PLATFORMS[tab].name}
            </Button>
          </Stack>
        </Box>

        <Box sx={{ py: 3, px: 3 }}>
          <Stack spacing={3}>
            {connectionError && (
              <Alert severity="error">{connectionError}</Alert>
            )}
            {isLoading ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : platformConnections.length > 0 ? (
              <Stack spacing={2}>
                {platformConnections.map((connection) => (
                  <Card
                    key={connection.id}
                    variant="outlined"
                    sx={highlightId === connection.id ? {
                      borderColor: "success.main",
                      borderWidth: 2,
                      animation: "pulse 1s ease-in-out 3",
                      "@keyframes pulse": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.7 },
                      },
                    } : undefined}
                  >
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        <Avatar
                          src={connection.metadata?.avatar}
                          sx={{ bgcolor: "background.default" }}
                        >
                          {PLATFORMS[tab].name.charAt(0)}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Typography variant="subtitle1" fontWeight="bold">
                              {connection.platformAccountName}
                            </Typography>
                            <Chip
                              label={connection.status}
                              size="small"
                              color={
                                connection.status === "active"
                                  ? "success"
                                  : "warning"
                              }
                            />
                            {connection.aiSettings?.enabled && (
                              <Chip
                                icon={<SmartToyIcon />}
                                label="AI"
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            )}
                          </Stack>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            mt={0.5}
                          >
                            ID: {connection.platformAccountId}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            mt={0.5}
                          >
                            Connected: {formatDate(connection.createdAt)} | Last
                            sync:{" "}
                            {connection.lastSyncAt
                              ? formatDate(connection.lastSyncAt)
                              : "Never"}
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
                        {connection.status === "active" ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        size="small"
                        startIcon={<SmartToyIcon />}
                        onClick={() => handleOpenAISettings(connection)}
                      >
                        AI Settings
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
            ) : (
              <Alert severity="info">
                No {PLATFORMS[tab].name} connections found. Click the button
                above to connect.
              </Alert>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Connection</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the connection to &quot;
            {connectionToDelete?.platformAccountName}&quot;? You will stop
            receiving messages from this account.
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
            {deleteConnection.isPending ? (
              <CircularProgress size={20} />
            ) : (
              "Delete"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* AI Settings Dialog */}
      <ConnectionAISettingsDialog
        open={aiSettingsDialogOpen}
        onClose={() => {
          setAiSettingsDialogOpen(false);
          setConnectionForAISettings(null);
        }}
        connection={connectionForAISettings}
      />

      {/* Telegram Connection Dialog */}
      <TelegramConnectionDialog
        open={telegram.isOpen}
        onClose={telegram.closeDialog}
        botToken={telegram.botToken}
        onBotTokenChange={telegram.setBotToken}
        onConnect={telegram.handleConnect}
        isLoading={telegram.isLoading}
        error={telegram.error}
      />
    </Box>
  );
}
