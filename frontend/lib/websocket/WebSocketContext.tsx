'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth';

interface WebSocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect and cleanup
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Initialize socket if not already created
    if (!socket) {
      const token = useAuthStore.getState().accessToken;
      if (!token) return;

      console.log('[WebSocketProvider] Initializing socket');

      const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('[WebSocketProvider] Connected');
        setIsConnected(true);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[WebSocketProvider] Disconnected:', reason);
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('[WebSocketProvider] Connection error:', error.message);
      });

      setSocket(newSocket);
    }

    // Cleanup on unmount or auth change
    return () => {
      // Don't disconnect here - let it persist during app lifecycle
    };
  }, [isAuthenticated, socket]);

  return (
    <WebSocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}
