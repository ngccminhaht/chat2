'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { useMessages } from '@/features/conversations/hooks/useMessages';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
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

  // Join conversation room for real-time updates
  useEffect(() => {
    if (conversationId) {
      wsClient.joinConversation(conversationId);

      return () => {
        wsClient.leaveConversation(conversationId);
      };
    }
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
