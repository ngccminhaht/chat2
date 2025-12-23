import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { WidgetAPI } from '../api';
import { WidgetSocket } from '../socket';
import { OrganizationConfig, Message, VisitorInfo } from '../types';

const DEFAULT_API_URL = 'http://localhost:8300/api';

interface UseWidgetProps {
  orgSlug: string;
  apiUrl?: string;
}

export function useWidget({ orgSlug, apiUrl = DEFAULT_API_URL }: UseWidgetProps) {
  const [orgConfig, setOrgConfig] = useState<OrganizationConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [visitorInfo, setVisitorInfo] = useState<VisitorInfo>({});
  const [preChatCompleted, setPreChatCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const socketRef = useRef<WidgetSocket | null>(null);
  const apiRef = useRef<WidgetAPI>(new WidgetAPI(apiUrl));
  const pendingMessageIdRef = useRef<string | null>(null);

  // Load visitor info from localStorage
  const loadVisitorInfo = useCallback((orgId: string) => {
    const key = `miagent_visitor_${orgId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const info = JSON.parse(saved);
        setVisitorInfo(info);
        setPreChatCompleted(true);
        return info;
      } catch {
        // Ignore parse errors
      }
    }
    return null;
  }, []);

  // Save visitor info to localStorage
  const saveVisitorInfo = useCallback((orgId: string, info: VisitorInfo) => {
    const key = `miagent_visitor_${orgId}`;
    localStorage.setItem(key, JSON.stringify(info));
  }, []);

  // Initialize widget
  useEffect(() => {
    const init = async () => {
      try {
        const config = await apiRef.current.fetchConfig(orgSlug);
        setOrgConfig(config);

        const savedInfo = loadVisitorInfo(config.organizationId);

        // Initialize socket
        const socket = new WidgetSocket(apiUrl, config.organizationId);
        socketRef.current = socket;

        socket.setCallbacks({
          onConnected: () => setIsConnected(true),
          onDisconnected: () => setIsConnected(false),
          onMessage: (message) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === message.id)) return prev;
              return [...prev, message];
            });
          },
          onMessageSent: () => {
            if (pendingMessageIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingMessageIdRef.current ? { ...m, status: 'sent' } : m
                )
              );
              pendingMessageIdRef.current = null;
            }
          },
          onMessageError: () => {
            if (pendingMessageIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingMessageIdRef.current ? { ...m, status: 'failed' } : m
                )
              );
              pendingMessageIdRef.current = null;
            }
          },
          onConversationRestored: (restoredMessages) => {
            setMessages(restoredMessages);
          },
          onPreChatSaved: () => {
            setPreChatCompleted(true);
          },
          onError: (code, message) => {
            console.error('[MiAgent] Error:', code, message);
          },
        });

        socket.connect(savedInfo || undefined);
        setIsLoading(false);
      } catch (error) {
        console.error('[MiAgent Widget] Failed to initialize', error);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      socketRef.current?.disconnect();
    };
  }, [orgSlug, apiUrl, loadVisitorInfo]);

  // Send message
  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || !socketRef.current || !isConnected) return;

    const tempId = 'temp_' + Date.now();
    const message: Message = {
      id: tempId,
      content: text,
      sender: 'user',
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, message]);
    pendingMessageIdRef.current = tempId;
    socketRef.current.sendMessage(text);
  }, [isConnected]);

  // Retry failed message
  const retryMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    sendMessage(content);
  }, [sendMessage]);

  // Submit pre-chat form
  const submitPreChat = useCallback((info: VisitorInfo) => {
    if (!orgConfig) return;

    setVisitorInfo(info);
    saveVisitorInfo(orgConfig.organizationId, info);
    socketRef.current?.submitPreChatForm(info);
    setPreChatCompleted(true);
  }, [orgConfig, saveVisitorInfo]);

  // Toggle widget open/close
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return {
    orgConfig,
    messages,
    isOpen,
    isConnected,
    isLoading,
    visitorInfo,
    preChatCompleted,
    sendMessage,
    retryMessage,
    submitPreChat,
    toggle,
    open,
    close,
  };
}
