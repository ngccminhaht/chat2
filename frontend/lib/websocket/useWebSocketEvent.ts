'use client';

import { useEffect, useRef } from 'react';
import { useWebSocket } from './WebSocketContext';

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
  const { socket } = useWebSocket();
  const handlerRef = useRef(handler);

  // Always keep ref updated with latest handler
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    // Stable wrapper function that calls the latest handler from ref
    const eventHandler = (data: T) => {
      handlerRef.current(data);
    };

    socket.on(event, eventHandler);

    // Cleanup: remove listener when event name changes or component unmounts
    return () => {
      socket.off(event, eventHandler);
    };
  }, [socket, event]); // Socket is now stable from WebSocketContext
}
