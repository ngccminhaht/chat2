'use client';

import { useEffect } from 'react';
import { wsClient } from '@/lib/websocket/client';

/**
 * Hook to listen to WebSocket events
 * Best practice: Use named functions for proper cleanup
 *
 * @example
 * ```tsx
 * useWebSocketEvent('message:new', (message) => {
 *   console.log('New message:', message);
 * });
 * ```
 */
export function useWebSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void
) {
  useEffect(() => {
    // Named function for proper cleanup
    const eventHandler = (data: T) => {
      handler(data);
    };

    wsClient.on(event, eventHandler);

    // Cleanup: remove listener when component unmounts
    return () => {
      wsClient.off(event, eventHandler);
    };
  }, [event, handler]);
}
