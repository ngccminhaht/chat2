'use client';

import { useParams } from 'next/navigation';
import { Box, Paper, Typography } from '@mui/material';
import { ChatBubbleOutline as ChatIcon } from '@mui/icons-material';
import ConversationList from '@/features/conversations/components/ConversationList';

export default function ConversationsPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <Box className="app-page-wrapper">
      <Box className="app-page-header">
        <Typography variant="h5" component="h1" className="app-page-title">
          Hội thoại khách hàng
        </Typography>
      </Box>
      <Box className="inbox-page-shell inbox-page-shell--empty">
        <ConversationList orgSlug={slug} className="inbox-conversation-list" />
        <Box className="inbox-empty-workspace">
          <Paper className="inbox-empty-state">
            <ChatIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1.5 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: "14px", mb: 0.5 }}>
              Chọn một hội thoại để xem tin nhắn
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "12px" }}>
              Chọn trong danh sách bên trái hoặc dùng bộ lọc để tìm hội thoại
            </Typography>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
