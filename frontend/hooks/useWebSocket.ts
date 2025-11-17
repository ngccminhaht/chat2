'use client';

import { useEffect } from 'react';
import { wsClient } from '@/lib/websocket/client';
import { useAuthStore } from '@/features/auth';

export function useWebSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      wsClient.connect();
    } else {
      wsClient.disconnect();
    }
  }, [isAuthenticated]);

  return wsClient;
}
