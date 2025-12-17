'use client';

import { Box, Container, Typography } from '@mui/material';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      component="main"
      display="flex"
      flexDirection="column"
      minHeight="100vh"
    >
      <Box component="header" py={2} px={3}>
        <Typography variant="h6" fontWeight="bold">
          Omnichannel Chat
        </Typography>
      </Box>
      <Container maxWidth="sm" sx={{ flexGrow: 1, py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
