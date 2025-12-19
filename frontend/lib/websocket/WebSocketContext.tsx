'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  const socketRef = useRef<Socket | null>(null);
  // Select accessToken directly - calling isAuthenticated() in selector is anti-pattern
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = !!accessToken;

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect and cleanup
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Initialize socket if not already created
    if (!socketRef.current) {
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

      socketRef.current = newSocket;
      setSocket(newSocket);
    }
  }, [isAuthenticated]);

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
