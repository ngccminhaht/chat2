"use client";

import { useState } from "react";
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
  Facebook as FacebookIcon,
  Chat as ZaloIcon,
  ShoppingBag as ShopeeIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import {
  usePlatformConnections,
  useDeletePlatformConnection,
  useUpdatePlatformConnectionStatus,
} from "@/features/connections/hooks/usePlatformConnections";
import { useConnectFacebook } from "@/features/connections/hooks/useConnectFacebook";
import { useConnectZalo } from "@/features/connections/hooks/useConnectZalo";
import { useConnectShopee } from "@/features/connections/hooks/useConnectShopee";
import { PlatformConnection } from "@/features/connections/types/platform-connection.types";
import { ConnectionStatus } from "@/lib/constants/statuses";

const PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook",
    icon: <FacebookIcon sx={{ color: "#1877F2" }} />,
  },
  { id: "zalo", name: "Zalo OA", icon: <ZaloIcon sx={{ color: "#0068ff" }} /> },
  {
    id: "shopee",
    name: "Shopee",
    icon: <ShopeeIcon sx={{ color: "#ee4d2d" }} />,
  },
  { id: "tiktok", name: "TikTok", icon: <ShopeeIcon sx={{ color: "#000" }} /> },
];

export default function ChannelsPage() {
  const [tab, setTab] = useState(0);
  const { data: connections, isLoading } = usePlatformConnections();
  const deleteConnection = useDeletePlatformConnection();
  const updateStatus = useUpdatePlatformConnectionStatus();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] =
    useState<PlatformConnection | null>(null);

  // OAuth connection hooks
  const { connectFacebook, isLoading: isLoadingFacebook, error: errorFacebook } =
    useConnectFacebook();
  const { connectZalo, isLoading: isLoadingZalo, error: errorZalo } = useConnectZalo();
  const { connectShopee, isLoading: isLoadingShopee, error: errorShopee } = useConnectShopee();

  const currentPlatform = PLATFORMS[tab].id;
  const platformConnections =
    connections?.filter((c) => c.platform === currentPlatform) || [];

  // Get current platform error
  const connectionError =
    currentPlatform === "facebook" ? errorFacebook :
    currentPlatform === "zalo" ? errorZalo :
    currentPlatform === "shopee" ? errorShopee : null;

  const handleConnect = () => {
    if (currentPlatform === "facebook") {
      connectFacebook();
    } else if (currentPlatform === "zalo") {
      connectZalo();
    } else if (currentPlatform === "shopee") {
      connectShopee();
    } else if (currentPlatform === "tiktok") {
      alert("TikTok Shop connection coming soon!");
    }
  };

  const isConnecting = () => {
    if (currentPlatform === "facebook") return isLoadingFacebook;
    if (currentPlatform === "zalo") return isLoadingZalo;
    if (currentPlatform === "shopee") return isLoadingShopee;
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
    <Box sx={{ height: "calc(100vh - 112px)", overflow: "auto", p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Channels
      </Typography>
      <Paper variant="outlined" sx={{ maxWidth: 900 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ pr: 2 }}
          >
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              {PLATFORMS.map((platform) => (
                <Tab
                  key={platform.id}
                  icon={platform.icon}
                  label={platform.name}
                  iconPosition="start"
                />
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
                  <Card key={connection.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        <Avatar sx={{ bgcolor: "background.default" }}>
                          {PLATFORMS[tab].icon}
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
    </Box>
  );
}
