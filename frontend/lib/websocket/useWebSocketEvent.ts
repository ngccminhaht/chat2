'use client';

import { useEffect, useRef } from 'react';
import { wsClient } from './client';

/**
 * Hook to listen to WebSocket events with automatic cleanup
 * Uses ref pattern to prevent re-registration on handler changes
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
  // Store handler in ref to avoid re-registering on every render
  const handlerRef = useRef(handler);

  // Update ref when handler changes (but don't re-register listener)
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    // Stable wrapper function that calls the latest handler from ref
    const eventHandler = (data: T) => {
      handlerRef.current(data);
    };

    wsClient.on(event, eventHandler);

    // Cleanup: remove listener when event name changes or component unmounts
    return () => {
      wsClient.off(event, eventHandler);
    };
  }, [event]); // Only re-register when event name changes, not when handler changes
}
