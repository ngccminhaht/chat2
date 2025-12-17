'use client';

import { useParams } from 'next/navigation';
import { Box, Stack, Paper, Typography } from '@mui/material';
import { ChatBubbleOutline as ChatIcon } from '@mui/icons-material';
import ConversationList from '@/features/conversations/components/ConversationList';

export default function ConversationsPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
        <Box sx={{ width: '33%', minWidth: 300 }}>
          <ConversationList orgSlug={slug} />
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <ChatIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Select a conversation to view messages
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose from the list on the left or use filters to find conversations
            </Typography>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
