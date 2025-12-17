'use client';

import { Box, Container, AppBar, Toolbar, Typography } from '@mui/material';

export default function OrgSelectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6">MiAgent</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
