'use client';

import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack, Avatar, IconButton } from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import { useInfiniteMessages } from '@/features/conversations/hooks/useInfiniteMessages';
import { useConversation } from '@/features/conversations/hooks/useConversation';
import { useMarkAsRead } from '@/features/conversations/hooks/useMarkAsRead';
import { useConversationStore } from '@/features/conversations/stores/conversationStore';
import MessageList from '@/features/conversations/components/MessageList';
import MessageInput from '@/features/conversations/components/MessageInput';
import ConversationList from '@/features/conversations/components/ConversationList';
import CustomerInfoPopover from '@/features/conversations/components/CustomerInfoPopover';
import ConversationSettingsModal from '@/features/conversations/components/ConversationSettingsModal';
import NotesPanel from '@/features/conversations/components/NotesPanel';

const EMPTY_MESSAGES: any[] = [];

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const slug = params.slug as string;
  const markedAsReadRef = useRef<string | null>(null);

  // Popover & Modal states
  const [customerInfoAnchor, setCustomerInfoAnchor] = useState<HTMLElement | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMessages({ conversationId });
  const { data: conversationData } = useConversation({ conversationId });
  const { mutate: markAsRead } = useMarkAsRead();

  const apiMessages = useMemo(() => {
    if (!data?.pages) return [];
    return [...data.pages].reverse().flatMap((page) => page.data);
  }, [data?.pages]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const messagesFromStore = useConversationStore((state) => state.messages[conversationId]);
  const storeMessages = messagesFromStore || EMPTY_MESSAGES;

  const conversationFromStore = useConversationStore((state) =>
    state.conversations.find((c) => c._id === conversationId)
  );

  // Prefer store (has real-time data from list), fallback to API
  const conversation = conversationFromStore || conversationData;

  useEffect(() => {
    if (apiMessages.length > 0 && conversationId) {
      const currentMessages = useConversationStore.getState().messages[conversationId] || [];

      if (currentMessages.length === 0) {
        useConversationStore.getState().setMessages(conversationId, apiMessages);
      } else {
        const apiMessageIds = new Set(apiMessages.map((m) => m._id));
        const newMessagesFromWebSocket = currentMessages.filter((m) => !apiMessageIds.has(m._id));
        const mergedMessages = [...apiMessages, ...newMessagesFromWebSocket];
        useConversationStore.getState().setMessages(conversationId, mergedMessages);
      }
    }
  }, [apiMessages, conversationId]);

  useEffect(() => {
    if (conversationData) {
      useConversationStore.getState().updateConversation(conversationData);
    }
  }, [conversationData]);

  // Mark as read only when page is visible and user is viewing the conversation
  useEffect(() => {
    if (markedAsReadRef.current === conversationId) return;

    // Check if page is visible (not minimized, not in background tab)
    if (document.hidden) {
      console.log('[ConversationDetail] Page hidden, skip mark as read');
      return;
    }

    // Mark as read based on conversation unread count or message status
    const shouldMarkAsRead =
      (conversation?.unreadCount && conversation.unreadCount > 0) ||
      (storeMessages.length > 0 && storeMessages.some(
        (msg) => msg.direction === 'inbound' && msg.status !== 'read'
      ));

    if (conversationId && shouldMarkAsRead) {
      markedAsReadRef.current = conversationId;
      markAsRead({ conversationId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unreadCount, storeMessages.length]);

  useEffect(() => {
    markedAsReadRef.current = null;
  }, [conversationId]);

  // Handle visibility change - mark as read when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && conversationId) {
        console.log('[ConversationDetail] Page visible again, checking unread messages');

        // Reset the ref to allow re-marking as read
        markedAsReadRef.current = null;

        // Check if there are unread messages
        const shouldMarkAsRead =
          (conversation?.unreadCount && conversation.unreadCount > 0) ||
          (storeMessages.length > 0 && storeMessages.some(
            (msg) => msg.direction === 'inbound' && msg.status !== 'read'
          ));

        if (shouldMarkAsRead) {
          markedAsReadRef.current = conversationId;
          markAsRead({ conversationId });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [conversationId, conversation?.unreadCount, storeMessages, markAsRead]);

  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
        <Box sx={{ width: '28%', minWidth: 280, display: { xs: 'none', md: 'block' } }}>
          <ConversationList activeConversationId={conversationId} orgSlug={slug} />
        </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ cursor: 'pointer' }}
                  onClick={(e) => setCustomerInfoAnchor(e.currentTarget)}
                >
                  <Avatar src={conversation?.customerAvatar} alt={conversation?.customerName || 'User'}>
                    {conversation?.customerName?.charAt(0) || 'U'}
                  </Avatar>
                  <Box>
                    <Typography variant="h6">{conversation?.customerName || 'Unknown User'}</Typography>
                    <Chip label={conversation?.platform || 'Unknown'} size="small" variant="outlined" />
                  </Box>
                </Stack>
                <IconButton onClick={() => setShowSettingsModal(true)}>
                  <MoreIcon />
                </IconButton>
              </Stack>
            </Box>

            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              <MessageList
                messages={storeMessages.length > 0 ? storeMessages : apiMessages}
                isLoading={isLoading && storeMessages.length === 0}
                isFetchingMore={isFetchingNextPage}
                hasMore={hasNextPage}
                onLoadMore={handleLoadMore}
              />
            </Box>

            <Box sx={{ flexShrink: 0 }}>
              <MessageInput conversationId={conversationId} />
            </Box>
          </Paper>
        </Box>

        <Box sx={{ width: '28%', minWidth: 280, display: { xs: 'none', lg: 'block' } }}>
          <NotesPanel conversationId={conversationId} />
        </Box>
      </Stack>

      {/* Customer Info Popover */}
      {conversation && (
        <CustomerInfoPopover
          anchorEl={customerInfoAnchor}
          onClose={() => setCustomerInfoAnchor(null)}
          conversation={conversation}
        />
      )}

      {/* Conversation Settings Modal */}
      {conversation && (
        <ConversationSettingsModal
          open={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversation={conversation}
        />
      )}
    </Box>
  );
}
