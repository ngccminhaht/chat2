'use client';

import { Box, Container, Toolbar } from '@mui/material';
import Header from '@/components/layout/Header';

export default function OrgSelectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box>
      <Header showMenuButton={false} />
      <Toolbar />
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
