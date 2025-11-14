'use client';

import { Box, Stack } from '@mui/material';
import ConversationList from '@/features/conversations/components/ConversationList';
import EmptyState from '@/components/common/EmptyState';

export default function ConversationsPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
        <Box sx={{ width: '33%', minWidth: 300 }}>
          <ConversationList />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <EmptyState message="Select a conversation to view messages" />
        </Box>
      </Stack>
    </Box>
  );
}
