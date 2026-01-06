"use client";

import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useKeycloak } from "@/lib/keycloak/KeycloakProvider";
import { useAuthStore } from "../stores/authStore";

// LoginForm only handles login UI - OnboardingGuard handles all routing
export function LoginForm() {
  const { initialized, login } = useKeycloak();
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  // Show loading while initializing
  if (!initialized || !hasHydrated) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        gap={2}
      >
        <CircularProgress />
        <Typography color="text.secondary">
          Initializing...
        </Typography>
      </Box>
    );
  }

  // Show login button - OnboardingGuard will redirect if already authenticated
  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      gap={3}
    >
      <Typography variant="h4" component="h1">
        Welcome
      </Typography>
      <Typography color="text.secondary">
        Sign in to continue
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={login}
      >
        Sign in with SSO
      </Button>
    </Box>
  );
}
