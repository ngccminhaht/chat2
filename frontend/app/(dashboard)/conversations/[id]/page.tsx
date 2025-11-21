'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack, Avatar } from '@mui/material';
import { useMessages } from '@/features/conversations/hooks/useMessages';
import { useConversation } from '@/features/conversations/hooks/useConversation';
import { useMarkAsRead } from '@/features/conversations/hooks/useMarkAsRead';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import MessageList from '@/features/conversations/components/MessageList';
import MessageInput from '@/features/conversations/components/MessageInput';
import ConversationList from '@/features/conversations/components/ConversationList';

// Empty array constant to avoid re-creating on every render
const EMPTY_MESSAGES: any[] = [];

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;

  const { data, isLoading } = useMessages({ conversationId });
  const { data: conversationData } = useConversation({ conversationId });
  const { mutate: markAsRead } = useMarkAsRead();

  // Get messages from Zustand store (updated by WebSocket)
  const messagesFromStore = useConversationStore((state) => state.messages[conversationId]);
  const storeMessages = messagesFromStore || EMPTY_MESSAGES;

  // Get conversation from Zustand store
  const conversationFromStore = useConversationStore((state) =>
    state.conversations.find((c) => c._id === conversationId)
  );

  // Use conversation from API if store doesn't have it
  const conversation = conversationFromStore || conversationData;

  // Get customer participant
  const customer = conversation?.participants.find((p) => p.role === 'customer');

  // Sync initial query data to Zustand store
  useEffect(() => {
    if (data?.data && conversationId) {
      useConversationStore.getState().setMessages(conversationId, data.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.data, conversationId]);

  // Sync conversation data to store
  useEffect(() => {
    if (conversationData) {
      useConversationStore.getState().updateConversation(conversationData);
    }
  }, [conversationData]);

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (conversationId && storeMessages.length > 0) {
      // Check if there are any unread inbound messages
      const hasUnreadMessages = storeMessages.some(
        (msg) => msg.direction === 'inbound' && msg.status !== 'read'
      );

      if (hasUnreadMessages) {
        markAsRead({ conversationId });
      }
    }
  }, [conversationId, storeMessages, markAsRead]);

  // NOTE: WebSocket event listeners are handled globally by useConversationWebSocketEvents
  // in the root layout. No need to join/leave conversation rooms - user automatically
  // receives all events through user:${userId} room.

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
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  src={customer?.avatar}
                  alt={customer?.name || 'User'}
                >
                  {customer?.name?.charAt(0) || 'U'}
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {customer?.name || 'Unknown User'}
                  </Typography>
                  <Chip
                    label={conversation?.platform || 'Unknown'}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Stack>
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
