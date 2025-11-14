'use client';

import { Box, Toolbar } from '@mui/material';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize WebSocket connection for real-time updates
  useWebSocket();

  return (
    <Box sx={{ display: 'flex' }}>
      <Header />
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
