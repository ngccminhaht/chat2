import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth';
import { useConversationStore } from '@/features/conversations';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pendingRooms: Set<string> = new Set();

  connect() {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      console.warn('No auth token available - WebSocket connection skipped');
      return;
    }

    // Don't reconnect if already connected
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
    }

    this.socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.setupListeners();
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;

      // Rejoin pending rooms after reconnection
      this.pendingRooms.forEach((conversationId) => {
        this.socket?.emit('join:conversation', { conversationId });
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      // Don't auto-reconnect if disconnect was intentional
      if (reason !== 'io client disconnect') {
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      // Don't spam reconnect on auth errors
      if (error.message.includes('Unauthorized') || error.message.includes('jwt')) {
        console.error('Authentication failed - stopping reconnect attempts');
        this.disconnect();
      } else {
        this.handleReconnect();
      }
    });

    // Message events
    this.socket.on('message:new', (message) => {
      const store = useConversationStore.getState();
      store.addMessage(message.conversationId, message);
    });

    this.socket.on('message:status', ({ conversationId, messageId, status }) => {
      const store = useConversationStore.getState();
      store.updateMessageStatus(conversationId, messageId, status);
    });

    this.socket.on('conversation:updated', (conversation) => {
      const store = useConversationStore.getState();
      store.updateConversation(conversation);
    });

    this.socket.on('typing:indicator', ({ conversationId, userId, isTyping }) => {
      const store = useConversationStore.getState();
      const currentTyping = store.typingUsers[conversationId] || [];

      if (isTyping) {
        if (!currentTyping.includes(userId)) {
          store.setTypingUsers(conversationId, [...currentTyping, userId]);
        }
      } else {
        store.setTypingUsers(
          conversationId,
          currentTyping.filter((id) => id !== userId)
        );
      }
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(), delay);
    }
  }

  joinConversation(conversationId: string) {
    if (!this.socket) return;

    // Track this room for auto-rejoin on reconnect
    this.pendingRooms.add(conversationId);

    if (this.socket.connected) {
      this.socket.emit('join:conversation', { conversationId });
    }
    // If not connected, it will join when 'connect' event fires
  }

  leaveConversation(conversationId: string) {
    // Remove from pending rooms
    this.pendingRooms.delete(conversationId);

    if (this.socket?.connected) {
      this.socket.emit('leave:conversation', { conversationId });
    }
  }

  sendTypingStart(conversationId: string) {
    if (this.socket?.connected) {
      this.socket.emit('typing:start', { conversationId });
    }
  }

  sendTypingStop(conversationId: string) {
    if (this.socket?.connected) {
      this.socket.emit('typing:stop', { conversationId });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.pendingRooms.clear();
    this.reconnectAttempts = 0;
  }
}

export const wsClient = new WebSocketClient();
