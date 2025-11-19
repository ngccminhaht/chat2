"use client";

import {
  Box,
  Typography,
  Grid,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from "@mui/material";
import {
  usePlatformConnections,
  useDeletePlatformConnection,
  useUpdatePlatformConnectionStatus,
} from "@/features/connections/hooks/usePlatformConnections";
import PlatformConnectionCard from "@/features/connections/components/PlatformConnectionCard";
import ConnectPlatformButton from "@/features/connections/components/ConnectPlatformButton";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConnectionStatus } from "@/lib/constants";

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: connections, isLoading, error } = usePlatformConnections();
  const deleteMutation = useDeletePlatformConnection();
  const updateStatusMutation = useUpdatePlatformConnectionStatus();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Show all platforms - allow multiple accounts per platform
  const allPlatforms = ["zalo", "facebook", "tiktok", "shopee"];

  const [selectedTab, setSelectedTab] = useState<string>(allPlatforms[0]);

  useEffect(() => {
    // Check if OAuth callback with success status
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    const account = searchParams.get("account");
    const action = searchParams.get("action");

    if (status === "success" && platform) {
      const actionText = action === "synced" ? "synced" : "connected";
      setSuccessMessage(
        `Successfully ${actionText} ${platform}${
          account ? `: ${account}` : ""
        }!`
      );

      // Refetch connections to show the new one
      queryClient.invalidateQueries({ queryKey: ["connections"] });

      // Clear URL params after showing message
      window.history.replaceState({}, "", "/connections");

      // Auto-hide message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  }, [searchParams, queryClient]);

  const handleDisconnect = async (connectionId: string) => {
    if (confirm("Are you sure you want to disconnect this platform?")) {
      try {
        await deleteMutation.mutateAsync(connectionId);
        setSuccessMessage("Platform disconnected successfully!");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error) {
        console.error("Failed to disconnect platform:", error);
      }
    }
  };

  const handleToggleStatus = async (
    connectionId: string,
    newStatus: ConnectionStatus
  ) => {
    try {
      await updateStatusMutation.mutateAsync({
        connectionId,
        status: newStatus,
      });
      setSuccessMessage(
        `Platform ${
          newStatus === ConnectionStatus.ACTIVE ? "activated" : "deactivated"
        } successfully!`
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Failed to update platform status:", error);
    }
  };

  // Filter connections based on selected tab
  const filteredConnections = connections?.filter(
    (conn) => conn.platform === selectedTab
  );

  // Count connections per platform
  const platformCounts = allPlatforms.reduce((acc, platform) => {
    acc[platform] =
      connections?.filter((conn) => conn.platform === platform).length || 0;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Connections
      </Typography>

      {successMessage && (
        <Box mb={2}>
          <Alert severity="success">{successMessage}</Alert>
        </Box>
      )}

      {/* Platform Tabs and Connect Button */}
      <Box mb={3}>
        <Grid container spacing={2} alignItems="center">
          <Grid size="grow">
            <Tabs
              value={selectedTab}
              onChange={(_, newValue) => setSelectedTab(newValue)}
              variant="scrollable"
            >
              {allPlatforms.map((platform) => (
                <Tab
                  key={platform}
                  label={`${
                    platform.charAt(0).toUpperCase() + platform.slice(1)
                  } (${platformCounts[platform]})`}
                  value={platform}
                />
              ))}
            </Tabs>
          </Grid>
          <Grid size="auto">
            <ConnectPlatformButton
              platform={
                selectedTab as "facebook" | "zalo" | "tiktok" | "shopee"
              }
            />
          </Grid>
        </Grid>
      </Box>

      {/* Connected Platforms */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">Failed to load connections</Alert>
      ) : filteredConnections && filteredConnections.length > 0 ? (
        <Box mb={4}>
          <Grid container spacing={2}>
            {filteredConnections.map((connection) => (
              <Grid size={{ xs: 12, md: 6 }} key={connection.id}>
                <PlatformConnectionCard
                  connection={connection}
                  onDisconnect={handleDisconnect}
                  onToggleStatus={handleToggleStatus}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      ) : (
        <Alert severity="info">
          No {selectedTab} connections yet. Use the connect button above!
        </Alert>
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
