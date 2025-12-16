import { io, Socket } from 'socket.io-client';

export interface WidgetSocketOptions {
  sessionId: string;
  organizationId: string;
  serverUrl: string;
  name?: string;
  email?: string;
}

export interface WidgetSocket {
  on: (event: string, callback: (...args: any[]) => void) => void;
  once: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
  sendMessage: (data: { text?: string; type?: string; mediaUrl?: string }) => void;
  startTyping: () => void;
  stopTyping: () => void;
  submitPreChat: (data: { name?: string; email?: string; phone?: string }) => void;
  disconnect: () => void;
}

export function createSocket(options: WidgetSocketOptions): WidgetSocket {
  const socket: Socket = io(`${options.serverUrl}/visitor`, {
    auth: {
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      name: options.name,
      email: options.email,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
  });

  return {
    on: (event, callback) => {
      socket.on(event, callback);
    },

    once: (event, callback) => {
      socket.once(event, callback);
    },

    off: (event, callback) => {
      socket.off(event, callback);
    },

    sendMessage: (data) => {
      socket.emit('message:send', data);
    },

    startTyping: () => {
      socket.emit('typing:start');
    },

    stopTyping: () => {
      socket.emit('typing:stop');
    },

    submitPreChat: (data) => {
      socket.emit('pre-chat:submit', data);
    },

    disconnect: () => {
      socket.disconnect();
    },
  };
}
