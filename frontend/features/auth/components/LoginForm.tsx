"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  CircularProgress,
} from "@mui/material";
import { useKeycloak } from "@/lib/keycloak/KeycloakProvider";
import { useAuthStore } from "../stores/authStore";

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const { initialized, authenticated, login } = useKeycloak();

  const accessToken = useAuthStore((state) => state.accessToken);
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!hasHydrated || !initialized) return;

    if (authenticated && accessToken) {
      if (organization?.slug) {
        router.replace(`/organizations/${organization.slug}/conversations`);
      } else {
        router.replace('/create-organization');
      }
    }
  }, [authenticated, accessToken, organization, hasHydrated, initialized, router]);

  // Show loading while Keycloak initializes
  if (!initialized || !hasHydrated) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // If authenticated, show loading (will redirect)
  if (authenticated && accessToken) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
    >
      <Card>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            {t("login")}
          </Typography>

          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t("loginWithSSO")}
          </Typography>

          <Button
            fullWidth
            variant="contained"
            onClick={login}
            size="large"
          >
            {t("loginWithKeycloak")}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
