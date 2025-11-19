'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  TextField,
  List,
  Tabs,
  Tab,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ConversationItem from './ConversationItem';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';
import { useConversations } from '../hooks/useConversations';
import { useConversationStore } from '../stores/conversationStore';
import { useWebSocketEvent } from '@/lib/websocket/useWebSocketEvent';

interface ConversationListProps {
  activeConversationId?: string;
}

export default function ConversationList({ activeConversationId }: ConversationListProps) {
  const [status, setStatus] = useState<'open' | 'closed' | 'archived'>('open');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useConversations({ status, page: 1, limit: 50 });

  // Listen for connection deletion events and refetch conversations
  const handleConnectionDeleted = useCallback(() => {
    // Invalidate and refetch conversations when a connection is deleted
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Listen for connection creation events and refetch conversations
  const handleConnectionCreated = useCallback(() => {
    // Invalidate and refetch conversations when a new connection is created
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Listen for conversation updates from new messages
  const handleConversationUpdated = useCallback((conversation: any) => {
    // Add or update conversation in store
    useConversationStore.getState().addConversation(conversation);
  }, []);

  useWebSocketEvent('connection:deleted', handleConnectionDeleted);
  useWebSocketEvent('connection:created', handleConnectionCreated);
  useWebSocketEvent('conversation:updated', handleConversationUpdated);

  const handleStatusChange = (_event: React.SyntheticEvent, newValue: string) => {
    setStatus(newValue as 'open' | 'closed' | 'archived');
  };

  const filteredConversations = data?.data.filter((conversation) => {
    if (!search) return true;
    const customer = conversation.participants.find((p) => p.role === 'customer');
    return (
      customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      conversation.lastMessage?.text?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={status} onChange={handleStatusChange}>
          <Tab label="Open" value="open" />
          <Tab label="Closed" value="closed" />
          <Tab label="Archived" value="archived" />
        </Tabs>
      </Box>

      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {isLoading && <LoadingSpinner />}
        {error && <EmptyState message="Error loading conversations" />}
        {!isLoading && !error && filteredConversations?.length === 0 && (
          <EmptyState message="No conversations found" />
        )}
        {!isLoading && !error && filteredConversations && filteredConversations.length > 0 && (
          <List>
            {filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                isActive={conversation._id === activeConversationId}
              />
            ))}
          </List>
        )}
      </Box>
    </Paper>
  );
}
