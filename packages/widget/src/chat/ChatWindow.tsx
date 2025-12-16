import { FunctionComponent, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { styled } from 'goober';
import { WidgetConfig } from '../lib/config';
import { createSocket, WidgetSocket } from '../lib/socket';
import { getMessages, saveMessage, clearUnread, Message as StoredMessage } from '../lib/storage';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { PreChatForm } from './PreChatForm';

interface ChatWindowProps {
  config: WidgetConfig;
  sessionId: string;
  onClose: () => void;
}

export const ChatWindow: FunctionComponent<ChatWindowProps> = ({
  config,
  sessionId,
  onClose,
}) => {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [showPreChat, setShowPreChat] = useState(config.preChatForm);
  const socketRef = useRef<WidgetSocket | null>(null);

  useEffect(() => {
    // Load cached messages
    setMessages(getMessages(sessionId));
    clearUnread(sessionId);

    // Connect WebSocket
    const socket = createSocket({
      sessionId,
      organizationId: config.organizationId,
      serverUrl: getSocketUrl(),
    });

    socket.on('connected', () => {
      setIsConnected(true);
    });

    socket.on('conversation:restored', (data: { messages?: StoredMessage[] }) => {
      if (data.messages) {
        setMessages(data.messages);
      }
    });

    socket.on('message:new', (message: { messageId: string; text?: string; mediaUrl?: string; timestamp: number }) => {
      const newMsg: StoredMessage = {
        id: message.messageId,
        text: message.text,
        mediaUrl: message.mediaUrl,
        direction: 'inbound',
        timestamp: message.timestamp,
        status: 'delivered',
      };
      setMessages((prev) => [...prev, newMsg]);
      saveMessage(sessionId, newMsg);
    });

    socket.on('agent:typing', (data: { isTyping: boolean }) => {
      setIsAgentTyping(data.isTyping);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('error', () => {
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [sessionId, config.organizationId]);

  const handleSendMessage = (text: string) => {
    if (!socketRef.current || !isConnected) return;

    const tempId = `temp_${Date.now()}`;
    const newMsg: StoredMessage = {
      id: tempId,
      text,
      direction: 'outbound',
      timestamp: Date.now(),
      status: 'pending',
    };

    setMessages((prev) => [...prev, newMsg]);

    socketRef.current.sendMessage({
      text,
      type: 'text',
    });

    // Update status when confirmed
    socketRef.current.once('message:sent', (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: data.messageId, status: 'sent' as const }
            : m
        )
      );
      saveMessage(sessionId, { ...newMsg, id: data.messageId, status: 'sent' });
    });

    socketRef.current.once('message:error', () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
    });
  };

  const handleTyping = (isTyping: boolean) => {
    if (!socketRef.current) return;
    if (isTyping) {
      socketRef.current.startTyping();
    } else {
      socketRef.current.stopTyping();
    }
  };

  const handlePreChatSubmit = (data: { name?: string; email?: string }) => {
    setShowPreChat(false);

    if (socketRef.current) {
      socketRef.current.submitPreChat(data);
    }
  };

  const positionStyle = config.position === 'left' ? { left: '20px' } : { right: '20px' };

  return (
    <Container style={positionStyle}>
      <Header
        title={config.organizationName}
        color={config.primaryColor}
        isConnected={isConnected}
        onClose={onClose}
      />

      {showPreChat ? (
        <PreChatForm
          fields={config.preChatFields}
          onSubmit={handlePreChatSubmit}
        />
      ) : (
        <Fragment>
          <MessageList
            messages={messages}
            greeting={config.greeting}
          />

          {isAgentTyping && <TypingIndicator />}

          <MessageInput
            onSend={handleSendMessage}
            onTyping={handleTyping}
            disabled={!isConnected}
          />
        </Fragment>
      )}
    </Container>
  );
};

const Container = styled('div')`
  position: fixed;
  bottom: 90px;
  width: 370px;
  height: 520px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2147483646;

  @media (max-width: 480px) {
    width: 100%;
    height: 100%;
    bottom: 0;
    left: 0 !important;
    right: 0 !important;
    border-radius: 0;
  }
`;

function getSocketUrl(): string {
  // In production, use CDN-injected URL
  // For dev, default to localhost
  return (window as any).__MIAGENT_SOCKET_URL__ || 'http://localhost:3000';
}
