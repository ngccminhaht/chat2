'use client';

import { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { useMessages } from '@/features/conversations/hooks/useMessages';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import { useWebSocket } from '@/lib/websocket/WebSocketContext';
import { useWebSocketEvent } from '@/lib/websocket/useWebSocketEvent';
import MessageList from '@/features/conversations/components/MessageList';
import MessageInput from '@/features/conversations/components/MessageInput';
import ConversationList from '@/features/conversations/components/ConversationList';

// Empty array constant to avoid re-creating on every render
const EMPTY_MESSAGES: any[] = [];

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;

  const { socket, isConnected } = useWebSocket();
  const { data, isLoading } = useMessages({ conversationId });

  // Get messages from Zustand store (updated by WebSocket)
  const messagesFromStore = useConversationStore((state) => state.messages[conversationId]);
  const storeMessages = messagesFromStore || EMPTY_MESSAGES;

  // Sync initial query data to Zustand store
  useEffect(() => {
    if (data?.data && conversationId) {
      useConversationStore.getState().setMessages(conversationId, data.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.data, conversationId]);

  // WebSocket event handlers (using named functions for proper cleanup)
  const handleNewMessage = useCallback((message: any) => {
    if (message.conversationId === conversationId) {
      useConversationStore.getState().addMessage(conversationId, message);
    }
  }, [conversationId]);

  const handleMessageStatus = useCallback((data: any) => {
    if (data.conversationId === conversationId) {
      useConversationStore.getState().updateMessageStatus(
        conversationId,
        data.messageId,
        data.status
      );
    }
  }, [conversationId]);

  const handleConversationUpdated = useCallback((conversation: any) => {
    if (conversation._id === conversationId) {
      useConversationStore.getState().updateConversation(conversation);
    }
  }, [conversationId]);

  // Register WebSocket event listeners (auto cleanup on unmount)
  useWebSocketEvent('message:new', handleNewMessage);
  useWebSocketEvent('message:status', handleMessageStatus);
  useWebSocketEvent('conversation:updated', handleConversationUpdated);

  // Join/leave conversation room when connected
  useEffect(() => {
    if (!conversationId || !socket || !isConnected) return;

    console.log(`[Page] Joining room: ${conversationId}`);
    socket.emit('join:conversation', { conversationId });

    return () => {
      console.log(`[Page] Leaving room: ${conversationId}`);
      socket.emit('leave:conversation', { conversationId });
    };
  }, [conversationId, socket, isConnected]);

  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
        <Box sx={{ width: '33%', minWidth: 300 }}>
          <ConversationList activeConversationId={conversationId} />
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Fixed Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Typography variant="h6">Conversation</Typography>
              <Chip label={conversationId} size="small" variant="outlined" />
            </Box>

            {/* Scrollable Message List */}
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              <MessageList messages={storeMessages} isLoading={isLoading && storeMessages.length === 0} />
            </Box>

            {/* Fixed Message Input */}
            <Box sx={{ flexShrink: 0 }}>
              <MessageInput conversationId={conversationId} />
            </Box>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
