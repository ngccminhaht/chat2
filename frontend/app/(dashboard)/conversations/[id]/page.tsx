'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { useMessages } from '@/features/conversations/hooks/useMessages';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import { useWebSocketEvent } from '@/hooks/useWebSocketEvent';
import MessageList from '@/features/conversations/components/MessageList';
import MessageInput from '@/features/conversations/components/MessageInput';
import ConversationList from '@/features/conversations/components/ConversationList';
import { wsClient } from '@/lib/websocket/client';

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;

  const { data, isLoading } = useMessages({ conversationId });

  // Get messages from Zustand store (updated by WebSocket)
  const storeMessages = useConversationStore((state) => state.messages[conversationId] || []);

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

  // Join/leave conversation room
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (!conversationId) return;

    let intervalId: NodeJS.Timeout | null = null;

    // Try to join room, with retry if not connected yet
    const tryJoin = () => {
      if (wsClient.connected) {
        if (!hasJoinedRef.current) {
          wsClient.joinRoom(conversationId);
          hasJoinedRef.current = true;
        }
        // Stop retrying once joined
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Try immediately
    tryJoin();

    // If not connected, retry every 100ms (max 50 times = 5 seconds)
    if (!hasJoinedRef.current) {
      let attempts = 0;
      intervalId = setInterval(() => {
        attempts++;
        if (attempts > 50 || hasJoinedRef.current) {
          if (intervalId) clearInterval(intervalId);
          return;
        }
        tryJoin();
      }, 100);
    }

    return () => {
      // Cleanup interval
      if (intervalId) {
        clearInterval(intervalId);
      }
      // Leave room if joined
      if (hasJoinedRef.current) {
        wsClient.leaveRoom(conversationId);
        hasJoinedRef.current = false;
      }
    };
  }, [conversationId]);

  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
        <Box sx={{ width: '33%', minWidth: 300 }}>
          <ConversationList activeConversationId={conversationId} />
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6">Conversation</Typography>
              <Chip label={conversationId} size="small" variant="outlined" />
            </Box>
            <MessageList messages={storeMessages} isLoading={isLoading && storeMessages.length === 0} />
            <MessageInput conversationId={conversationId} />
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
