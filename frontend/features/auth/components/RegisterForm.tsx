"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Link as MuiLink,
  CircularProgress,
} from "@mui/material";
import Link from "next/link";
import { useRegister } from "../hooks/useRegister";
import { useAuthStore } from "../stores/authStore";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { mutate: register, isPending, error } = useRegister();

  const accessToken = useAuthStore((state) => state.accessToken);
  const organization = useAuthStore((state) => state.organization);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!hasHydrated) return;

    if (accessToken) {
      if (organization?.slug) {
        router.replace(`/organizations/${organization.slug}/conversations`);
      } else {
        router.replace('/organizations');
      }
    }
  }, [accessToken, organization, hasHydrated, router]);

  // Show loading while checking auth state
  if (!hasHydrated || accessToken) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ email, password, name });
  };

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
            Register
          </Typography>

          {error && (
            <Alert severity="error">
              {error.message || "Registration failed. Please try again."}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Full Name"
              name="name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={isPending}
            >
              {isPending ? "Creating account..." : "Register"}
            </Button>

            <Box mt={2} textAlign="center">
              <Typography variant="body2">
                Already have an account?{" "}
                <MuiLink component={Link} href="/login">
                  Login here
                </MuiLink>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
