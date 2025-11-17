'use client';

import { useEffect } from 'react';
import { wsClient } from '@/lib/websocket/client';
import { useAuthStore } from '@/features/auth';

/**
 * WebSocket initialization hook
 * Best practice: Initialize once on app mount, disconnect only on logout
 */
export function useWebSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      // Initialize socket connection (idempotent - safe to call multiple times)
      wsClient.initialize();
    } else {
      // Only disconnect when user logs out
      wsClient.disconnect();
    }
    // No cleanup function - socket stays connected during app lifecycle
  }, [isAuthenticated]);

  return wsClient;
}
