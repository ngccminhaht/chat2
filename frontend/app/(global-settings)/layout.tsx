'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, AppBar, Toolbar, Typography, IconButton, Container } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function GlobalSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const organization = useAuthStore((state) => state.organization);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  const handleBack = () => {
    // Go back to current org dashboard if available, otherwise to org selector
    if (organization?.slug) {
      router.push(`/organizations/${organization.slug}/conversations`);
    } else {
      router.push('/organizations');
    }
  };

  return (
    <Box>
      <AppBar position="fixed">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={handleBack}
            aria-label="back"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ ml: 2 }}>
            Settings
          </Typography>
        </Toolbar>
      </AppBar>
      <Box component="main">
        <Toolbar />
        <Container maxWidth="md" sx={{ py: 3 }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
