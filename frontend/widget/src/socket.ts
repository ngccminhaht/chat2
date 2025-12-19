import { io, Socket } from 'socket.io-client';
import { Message, VisitorInfo } from './types';

// Events emitted by server
interface ServerToClientEvents {
  connected: (data: { sessionId: string; organizationId: string }) => void;
  'conversation:restored': (data: {
    conversationId: string;
    messages: ServerMessage[];
  }) => void;
  'message:sent': (data: {
    messageId: string;
    conversationId: string;
    timestamp: string;
  }) => void;
  'message:received': (data: { message: ServerMessage }) => void;
  'message:error': (data: { error: string }) => void;
  'pre-chat:saved': () => void;
  'agent:typing': (data: { isTyping: boolean; agentName?: string }) => void;
  error: (data: { code: string; message: string }) => void;
}

// Events emitted by client
interface ClientToServerEvents {
  'message:send': (data: {
    text?: string;
    type?: string;
    mediaUrl?: string;
    fileName?: string;
  }) => void;
  'typing:start': () => void;
  'typing:stop': () => void;
  'pre-chat:submit': (data: VisitorInfo) => void;
}

// Message from server (may have different shape)
interface ServerMessage {
  _id: string;
  content: { text?: string; mediaUrl?: string };
  sender: { name?: string; platformUserId?: string };
  direction: 'inbound' | 'outbound';
  createdAt: string;
}

export type SocketEventCallback = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onMessage?: (message: Message) => void;
  onMessageSent?: (messageId: string) => void;
  onMessageError?: (error: string) => void;
  onConversationRestored?: (messages: Message[]) => void;
  onAgentTyping?: (isTyping: boolean, agentName?: string) => void;
  onPreChatSaved?: () => void;
  onError?: (code: string, message: string) => void;
};

export class WidgetSocket {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null =
    null;
  private sessionId: string;
  private organizationId: string;
  private apiUrl: string;
  private callbacks: SocketEventCallback = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(apiUrl: string, organizationId: string) {
    this.apiUrl = apiUrl;
    this.organizationId = organizationId;
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    const key = `miagent_session_${this.organizationId}`;
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem(key, sessionId);
    }
    return sessionId;
  }

  private generateSessionId(): string {
    return 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  setCallbacks(callbacks: SocketEventCallback) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  connect(visitorInfo?: VisitorInfo): void {
    if (this.socket?.connected) return;

    // Parse base URL for socket connection
    const wsUrl = this.apiUrl.replace('/api', '');

    this.socket = io(`${wsUrl}/visitor`, {
      auth: {
        sessionId: this.sessionId,
        organizationId: this.organizationId,
        name: visitorInfo?.name,
        email: visitorInfo?.email,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[MiAgent] Connected to server');
      this.reconnectAttempts = 0;
      this.callbacks.onConnected?.();
    });

    this.socket.on('disconnect', () => {
      console.log('[MiAgent] Disconnected from server');
      this.callbacks.onDisconnected?.();
    });

    this.socket.on('connected', () => {
      // Server confirmed connection
    });

    this.socket.on('conversation:restored', (data) => {
      const messages = data.messages.map((m) => this.normalizeMessage(m));
      this.callbacks.onConversationRestored?.(messages);
    });

    this.socket.on('message:sent', (data) => {
      this.callbacks.onMessageSent?.(data.messageId);
    });

    this.socket.on('message:received', (data) => {
      const message = this.normalizeMessage(data.message);
      this.callbacks.onMessage?.(message);
    });

    this.socket.on('message:error', (data) => {
      this.callbacks.onMessageError?.(data.error);
    });

    this.socket.on('agent:typing', (data) => {
      this.callbacks.onAgentTyping?.(data.isTyping, data.agentName);
    });

    this.socket.on('pre-chat:saved', () => {
      this.callbacks.onPreChatSaved?.();
    });

    this.socket.on('error', (data) => {
      console.error('[MiAgent] Socket error:', data.code, data.message);
      this.callbacks.onError?.(data.code, data.message);
    });
  }

  private normalizeMessage(serverMsg: ServerMessage): Message {
    const isInbound = serverMsg.direction === 'inbound';
    return {
      id: serverMsg._id,
      content: serverMsg.content.text || '',
      sender: isInbound ? 'user' : 'agent',
      timestamp: new Date(serverMsg.createdAt),
      mediaUrl: serverMsg.content.mediaUrl,
      agentName: !isInbound ? serverMsg.sender.name : undefined,
    };
  }

  sendMessage(text: string, mediaUrl?: string, fileName?: string): void {
    if (!this.socket?.connected) {
      this.callbacks.onMessageError?.('Not connected');
      return;
    }
    this.socket.emit('message:send', { text, mediaUrl, fileName });
  }

  startTyping(): void {
    if (!this.socket?.connected) return;

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.socket.emit('typing:start');

    // Auto-stop after 3 seconds
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  stopTyping(): void {
    if (!this.socket?.connected) return;
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    this.socket.emit('typing:stop');
  }

  submitPreChatForm(info: VisitorInfo): void {
    if (!this.socket?.connected) return;
    this.socket.emit('pre-chat:submit', info);
  }

  disconnect(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
