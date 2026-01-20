'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth';
import { useKeycloak, getKeycloakToken } from '@/lib/keycloak/KeycloakProvider';

const LOG_PREFIX = '[WebSocket]';

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
  // Get auth state from Keycloak
  const { authenticated, initialized, isLoadingOrganizations } = useKeycloak();
  const organizationId = useAuthStore((state) => state.organizationId);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    // Wait for auth store to hydrate and Keycloak to initialize
    if (!hasHydrated || !initialized) {
      console.log(`${LOG_PREFIX} Waiting for auth store hydration and Keycloak init...`);
      return;
    }

    if (!authenticated) {
      // Disconnect and cleanup
      if (socketRef.current) {
        console.log(`${LOG_PREFIX} Not authenticated, disconnecting...`);
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
        joinedOrgRef.current = null;
      }
      return;
    }

    // Wait for organizations to finish loading before connecting
    if (isLoadingOrganizations) {
      console.log(`${LOG_PREFIX} Waiting for organizations to load...`);
      return;
    }

    // Initialize socket if not already created
    if (!socketRef.current) {
      const token = getKeycloakToken();
      if (!token) {
        console.log(`${LOG_PREFIX} No token available, skipping socket init`);
        return;
      }

      const orgId = useAuthStore.getState().organizationId;
      console.log(`${LOG_PREFIX} Initializing socket (orgId: ${orgId})`);

      const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log(`${LOG_PREFIX} ✅ Connected (socketId: ${newSocket.id})`);
        setIsConnected(true);

        // Auto-join org:agents room if organizationId is available
        const currentOrgId = useAuthStore.getState().organizationId;
        if (currentOrgId && joinedOrgRef.current !== currentOrgId) {
          console.log(`${LOG_PREFIX} Joining org room: ${currentOrgId}`);
          newSocket.emit('join:org:agents', { organizationId: currentOrgId }, (response: { success: boolean; room: string; clientCount: number }) => {
            if (response?.success) {
              joinedOrgRef.current = currentOrgId;
              console.log(`${LOG_PREFIX} ✅ Joined room: ${response.room} (${response.clientCount} clients)`);
            } else {
              console.error(`${LOG_PREFIX} ❌ Failed to join org room:`, response);
            }
          });
        } else if (!currentOrgId) {
          console.warn(`${LOG_PREFIX} ⚠️ No organizationId available - cannot join room`);
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log(`${LOG_PREFIX} Disconnected:`, reason);
        setIsConnected(false);
        joinedOrgRef.current = null;
      });

      newSocket.on('connect_error', (error) => {
        console.error(`${LOG_PREFIX} Connection error:`, error.message);
      });

      // Debug: Log all incoming events
      newSocket.onAny((eventName, ...args) => {
        console.log(`${LOG_PREFIX} 📥 Event: ${eventName}`, args);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    }
  }, [hasHydrated, initialized, authenticated, isLoadingOrganizations]);

  // Handle org switch - join new org room
  useEffect(() => {
    if (!socketRef.current || !isConnected || !organizationId) return;

    // Leave old org room if different
    if (joinedOrgRef.current && joinedOrgRef.current !== organizationId) {
      socketRef.current.emit('leave:org:agents', { organizationId: joinedOrgRef.current });
      console.log(`${LOG_PREFIX} Left room: org:${joinedOrgRef.current}:agents`);
    }

    // Join new org room
    if (joinedOrgRef.current !== organizationId) {
      console.log(`${LOG_PREFIX} Switching to org room: ${organizationId}`);
      socketRef.current.emit('join:org:agents', { organizationId }, (response: { success: boolean; room: string; clientCount: number }) => {
        if (response?.success) {
          joinedOrgRef.current = organizationId;
          console.log(`${LOG_PREFIX} ✅ Switched to room: ${response.room} (${response.clientCount} clients)`);
        } else {
          console.error(`${LOG_PREFIX} ❌ Failed to switch org room:`, response);
        }
      });
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
