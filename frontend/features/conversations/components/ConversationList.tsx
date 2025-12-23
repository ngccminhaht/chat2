'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  TextField,
  List,
  Tabs,
  Tab,
  InputAdornment,
  IconButton,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ConversationItem from './ConversationItem';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';
import { useConversations } from '../hooks/useConversations';
import { useConversationStore } from '../stores/conversationStore';
import { useWebSocketEvent } from '@/lib/websocket/useWebSocketEvent';
import ConversationFilters, { ConversationFiltersState, getActiveFilterCount } from './ConversationFilters';

interface ConversationListProps {
  activeConversationId?: string;
  orgSlug: string;
}

export default function ConversationList({ activeConversationId, orgSlug }: ConversationListProps) {
  const [status, setStatus] = useState<'open' | 'closed' | 'archived'>('open');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<ConversationFiltersState>({});
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  const filterCount = getActiveFilterCount(filters);

  // Debounce search input (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Combine tab status with additional filters + server-side search
  const { data, isLoading, error } = useConversations({
    status: filters.status || status,
    platform: filters.platform,
    search: debouncedSearch || undefined,
    page: 1,
    limit: 50,
  });

  // Listen for connection deletion events and refetch conversations
  const handleConnectionDeleted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Listen for connection creation events and refetch conversations
  const handleConnectionCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Listen for conversation updates from new messages
  const handleConversationUpdated = useCallback((conversation: any) => {
    useConversationStore.getState().addConversation(conversation);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  useWebSocketEvent('connection:deleted', handleConnectionDeleted);
  useWebSocketEvent('connection:created', handleConnectionCreated);
  useWebSocketEvent('conversation:updated', handleConversationUpdated);

  const handleStatusChange = (_event: React.SyntheticEvent, newValue: string) => {
    setStatus(newValue as 'open' | 'closed' | 'archived');
  };

  const conversations = data?.data;

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
          size="small"
          placeholder="Search conversations..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={(e) => setFilterAnchor(e.currentTarget)}
                    color={filterCount > 0 ? 'primary' : 'default'}
                  >
                    <Badge badgeContent={filterCount} color="primary">
                      <FilterListIcon fontSize="small" />
                    </Badge>
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <ConversationFilters
          filters={filters}
          onFiltersChange={setFilters}
          anchorEl={filterAnchor}
          onClose={() => setFilterAnchor(null)}
        />
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {isLoading && <LoadingSpinner />}
        {error && <EmptyState message="Error loading conversations" />}
        {!isLoading && !error && conversations?.length === 0 && (
          <EmptyState message="No conversations found" />
        )}
        {!isLoading && !error && conversations && conversations.length > 0 && (
          <List>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                isActive={conversation._id === activeConversationId}
                orgSlug={orgSlug}
              />
            ))}
          </List>
        )}
      </Box>
    </Paper>
  );
}
