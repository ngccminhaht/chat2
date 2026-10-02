'use client';

import { useParams } from 'next/navigation';
import { Box, Paper, Typography } from '@mui/material';
import { ChatBubbleOutline as ChatIcon } from '@mui/icons-material';
import ConversationList from '@/features/conversations/components/ConversationList';

export default function ConversationsPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <Box className="inbox-page-shell inbox-page-shell--empty">
      <ConversationList orgSlug={slug} className="inbox-conversation-list" />
      <Box className="inbox-empty-workspace">
          <Paper className="inbox-empty-state">
            <ChatIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Chọn một hội thoại để xem tin nhắn
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Chọn trong danh sách bên trái hoặc dùng bộ lọc để tìm hội thoại
            </Typography>
          </Paper>
      </Box>
    </Box>
  );
}
