'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/lib/theme';
import { useState } from 'react';
import { WebSocketProvider } from '@/lib/websocket/WebSocketContext';
import { useConversationWebSocketEvents } from '@/lib/websocket/useConversationWebSocketEvents';

// Setup WebSocket event listeners at root level
// Ensures listeners register immediately when socket connects (no race condition)
function WebSocketEventSetup() {
  useConversationWebSocketEvents();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <WebSocketProvider>
            <WebSocketEventSetup />
            {children}
          </WebSocketProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
