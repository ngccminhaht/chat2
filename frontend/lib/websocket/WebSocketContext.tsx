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
  const joinedOrgRef = useRef<string | null>(null);
  // Select accessToken directly - calling isAuthenticated() in selector is anti-pattern
  const accessToken = useAuthStore((state) => state.accessToken);
  const organizationId = useAuthStore((state) => state.organizationId);
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
        joinedOrgRef.current = null;
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
        console.log(`[WebSocketProvider] Connected, socket id: ${newSocket.id}`);
        setIsConnected(true);

        // Auto-join org:agents room if organizationId is available
        const orgId = useAuthStore.getState().organizationId;
        console.log(`[WebSocketProvider] organizationId from store: ${orgId}`);
        if (orgId && joinedOrgRef.current !== orgId) {
          newSocket.emit('join:org:agents', { organizationId: orgId });
          joinedOrgRef.current = orgId;
          console.log(`[WebSocketProvider] Emitted join:org:agents for org: ${orgId}`);
        } else {
          console.log(`[WebSocketProvider] Not joining org room - orgId: ${orgId}, joinedOrgRef: ${joinedOrgRef.current}`);
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[WebSocketProvider] Disconnected:', reason);
        setIsConnected(false);
        joinedOrgRef.current = null;
      });

      newSocket.on('connect_error', (error) => {
        console.error('[WebSocketProvider] Connection error:', error.message);
      });

      // Debug: Log all incoming events
      newSocket.onAny((eventName, ...args) => {
        console.log(`[WebSocketProvider] 📥 Event received: ${eventName}`, args);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    }
  }, [isAuthenticated]);

  // Handle org switch - join new org room
  useEffect(() => {
    if (!socketRef.current || !isConnected || !organizationId) return;

    // Leave old org room if different
    if (joinedOrgRef.current && joinedOrgRef.current !== organizationId) {
      socketRef.current.emit('leave:org:agents', { organizationId: joinedOrgRef.current });
      console.log(`[WebSocketProvider] Left org:${joinedOrgRef.current}:agents room`);
    }

    // Join new org room
    if (joinedOrgRef.current !== organizationId) {
      socketRef.current.emit('join:org:agents', { organizationId });
      joinedOrgRef.current = organizationId;
      console.log(`[WebSocketProvider] Joined org:${organizationId}:agents room`);
    }
  }, [organizationId, isConnected]);

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
