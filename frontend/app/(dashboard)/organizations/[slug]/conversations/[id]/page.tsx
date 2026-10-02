'use client';

import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Paper, Typography, Chip, Stack, Avatar, IconButton, Button } from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useInfiniteMessages } from '@/features/conversations/hooks/useInfiniteMessages';
import { useConversation } from '@/features/conversations/hooks/useConversation';
import { useMarkAsRead } from '@/features/conversations/hooks/useMarkAsRead';
import { useMarkAsSeen } from '@/features/conversations/hooks/useMarkAsSeen';
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
  const router = useRouter();
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
  const { mutate: markAsSeen } = useMarkAsSeen();

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

  // Mark conversation as seen when user enters (resets unreadCount)
  useEffect(() => {
    if (conversationId && !document.hidden) {
      markAsSeen({ conversationId });
    }
    // Only run once when conversationId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
    <Box className="inbox-page-shell inbox-page-shell--detail">
        <ConversationList activeConversationId={conversationId} orgSlug={slug} className="inbox-conversation-list" />

        <Paper className="inbox-message-workspace">
            <Box className="inbox-workspace-header">
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ cursor: 'pointer' }}
                  onClick={(e) => setCustomerInfoAnchor(e.currentTarget)}
                >
                  <Button className="inbox-mobile-back" size="small" startIcon={<ArrowBackIcon />} onClick={(event) => { event.stopPropagation(); router.push(`/organizations/${slug}/conversations`); }}>
                    Danh sách
                  </Button>
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

            <Box className="inbox-message-list">
              <MessageList
                messages={storeMessages.length > 0 ? storeMessages : apiMessages}
                isLoading={isLoading && storeMessages.length === 0}
                isFetchingMore={isFetchingNextPage}
                hasMore={hasNextPage}
                onLoadMore={handleLoadMore}
              />
            </Box>

            <Box className="inbox-composer">
              <MessageInput conversationId={conversationId} />
            </Box>
        </Paper>

        <Box className="inbox-notes-panel">
          <NotesPanel conversationId={conversationId} />
        </Box>

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
