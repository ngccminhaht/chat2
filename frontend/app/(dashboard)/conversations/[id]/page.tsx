'use client';

import { useEffect, useMemo, useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack, Avatar, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';
import { useInfiniteMessages } from '@/features/conversations/hooks/useInfiniteMessages';
import { useConversation } from '@/features/conversations/hooks/useConversation';
import { useMarkAsRead } from '@/features/conversations/hooks/useMarkAsRead';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import MessageList from '@/features/conversations/components/MessageList';
import MessageInput from '@/features/conversations/components/MessageInput';
import ConversationList from '@/features/conversations/components/ConversationList';
import TypingIndicator from '@/features/conversations/components/TypingIndicator';
import CustomerInfoPanel from '@/features/conversations/components/CustomerInfoPanel';

// Empty array constant to avoid re-creating on every render
const EMPTY_MESSAGES: any[] = [];

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [showInfoPanel, setShowInfoPanel] = useState(!isMobile);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMessages({ conversationId });
  const { data: conversationData } = useConversation({ conversationId });
  const { mutate: markAsRead } = useMarkAsRead();

  // Flatten paginated messages (oldest first for display)
  const apiMessages = useMemo(() => {
    if (!data?.pages) return [];
    // Pages are fetched newest first, flatten and reverse for chronological order
    return data.pages.flatMap((page) => page.data).reverse();
  }, [data?.pages]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Get messages from Zustand store (updated by WebSocket)
  const messagesFromStore = useConversationStore((state) => state.messages[conversationId]);
  const storeMessages = messagesFromStore || EMPTY_MESSAGES;

  // Get typing users for this conversation
  const typingUsers = useConversationStore(
    (state) => state.typingUsers[conversationId] || []
  );

  // Get conversation from Zustand store
  const conversationFromStore = useConversationStore((state) =>
    state.conversations.find((c) => c._id === conversationId)
  );

  // Use conversation from API if store doesn't have it
  const conversation = conversationFromStore || conversationData;

  // Sync initial query data to Zustand store (only on first load)
  useEffect(() => {
    if (apiMessages.length > 0 && conversationId) {
      const currentMessages = useConversationStore.getState().messages[conversationId];
      // Only set messages if store is empty (initial load)
      // Don't overwrite if store already has messages (from WebSocket or previous load)
      if (!currentMessages || currentMessages.length === 0) {
        useConversationStore.getState().setMessages(conversationId, apiMessages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMessages, conversationId]);

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
        {/* Left: Conversation List */}
        <Box sx={{ width: '28%', minWidth: 280, display: { xs: 'none', md: 'block' } }}>
          <ConversationList activeConversationId={conversationId} />
        </Box>

        {/* Center: Messages */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Fixed Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar
                    src={conversation?.customerAvatar}
                    alt={conversation?.customerName || 'User'}
                  >
                    {conversation?.customerName?.charAt(0) || 'U'}
                  </Avatar>
                  <Box>
                    <Typography variant="h6">
                      {conversation?.customerName || 'Unknown User'}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Chip
                        label={conversation?.platform || 'Unknown'}
                        size="small"
                        variant="outlined"
                      />
                      {conversation?.assignedTo && (
                        <Chip
                          label={conversation.assignedTo.name}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Box>
                </Stack>
                {/* Toggle Info Panel Button */}
                <IconButton
                  onClick={() => setShowInfoPanel(!showInfoPanel)}
                  color={showInfoPanel ? 'primary' : 'default'}
                >
                  <InfoIcon />
                </IconButton>
              </Stack>
            </Box>

            {/* Scrollable Message List */}
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              <MessageList
                messages={storeMessages.length > 0 ? storeMessages : apiMessages}
                isLoading={isLoading && storeMessages.length === 0}
                isFetchingMore={isFetchingNextPage}
                hasMore={hasNextPage}
                onLoadMore={handleLoadMore}
              />
            </Box>

            {/* Typing Indicator */}
            <TypingIndicator typingUsers={typingUsers} />

            {/* Fixed Message Input */}
            <Box sx={{ flexShrink: 0 }}>
              <MessageInput conversationId={conversationId} />
            </Box>
          </Paper>
        </Box>

        {/* Right: Customer Info Panel */}
        {showInfoPanel && conversation && (
          <Box sx={{ width: '280px', minWidth: 280, display: { xs: 'none', lg: 'block' } }}>
            <CustomerInfoPanel
              conversation={conversation}
              onClose={() => setShowInfoPanel(false)}
            />
          </Box>
        )}
      </Stack>
    </Box>
  );
}
