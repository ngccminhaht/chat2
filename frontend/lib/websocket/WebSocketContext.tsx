'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { wsClient } from './client';
import { useAuthStore } from '@/features/auth';

interface WebSocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  socket: null,
  isConnected: false,
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  useEffect(() => {
    if (!isAuthenticated) {
      wsClient.disconnect();
      setIsConnected(false);
      return;
    }

    // Initialize WebSocket
    wsClient.initialize();

    // Listen to connection events to update state
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    wsClient.on('connect', handleConnect);
    wsClient.on('disconnect', handleDisconnect);

    // Check initial connection state
    if (wsClient.connected) {
      setIsConnected(true);
    }

    return () => {
      wsClient.off('connect', handleConnect);
      wsClient.off('disconnect', handleDisconnect);
    };
  }, [isAuthenticated]);

  return (
    <WebSocketContext.Provider value={{ socket: null, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return { wsClient, isConnected: context.isConnected };
}
