import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth';

/**
 * WebSocket Client Singleton
 * Best practice: Initialize once, never disconnect except on logout
 */
class WebSocketClient {
  private socket: Socket | null = null;
  private isInitialized = false;

  /**
   * Initialize socket connection (call once on app mount when authenticated)
   * Following Socket.IO best practice: separate initialization from React lifecycle
   */
  initialize() {
    if (this.isInitialized) {
      console.log('[WS] Already initialized');
      return;
    }

    const token = useAuthStore.getState().accessToken;
    if (!token) {
      console.warn('[WS] No auth token - skipping initialization');
      return;
    }

    console.log('[WS] Initializing socket connection');

    this.socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false, // Manual control per best practice
    });

    this.setupCoreListeners();
    this.socket.connect();
    this.isInitialized = true;
  }

  /**
   * Core listeners that should always be active
   * These handle connection lifecycle only
   */
  private setupCoreListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WS] Connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WS] Connection error:', error.message);
    });
  }

  /**
   * Register message event listeners
   * Call this from components/hooks with named functions for proper cleanup
   */
  on(event: string, handler: (...args: any[]) => void) {
    if (!this.socket) {
      console.warn(`[WS] Cannot register listener for ${event}: socket not initialized`);
      return;
    }
    this.socket.on(event, handler);
  }

  /**
   * Unregister message event listeners
   * MUST be called in useEffect cleanup to prevent memory leaks
   */
  off(event: string, handler: (...args: any[]) => void) {
    if (!this.socket) return;
    this.socket.off(event, handler);
  }

  /**
   * Join a conversation room
   * Room membership persists across reconnections automatically via Socket.IO
   */
  joinRoom(conversationId: string) {
    if (!this.socket?.connected) {
      console.warn(`[WS] Cannot join room ${conversationId}: not connected`);
      return;
    }

    console.log(`[WS] Joining room: ${conversationId}`);
    this.socket.emit('join:conversation', { conversationId });
  }

  /**
   * Leave a conversation room
   */
  leaveRoom(conversationId: string) {
    if (!this.socket?.connected) {
      return;
    }

    console.log(`[WS] Leaving room: ${conversationId}`);
    this.socket.emit('leave:conversation', { conversationId });
  }

  /**
   * Send typing indicator
   */
  sendTypingStart(conversationId: string) {
    if (this.socket?.connected) {
      this.socket.emit('typing:start', { conversationId });
    }
  }

  /**
   * Stop typing indicator
   */
  sendTypingStop(conversationId: string) {
    if (this.socket?.connected) {
      this.socket.emit('typing:stop', { conversationId });
    }
  }

  /**
   * Check if socket is connected
   */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Disconnect and cleanup (only call on logout)
   */
  disconnect() {
    if (!this.socket) return;

    console.log('[WS] Disconnecting and cleaning up');
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.isInitialized = false;
  }
}

export const wsClient = new WebSocketClient();
