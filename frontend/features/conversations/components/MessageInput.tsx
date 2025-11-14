'use client';

import { useState } from 'react';
import { Box, TextField, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useSendMessage } from '../hooks/useSendMessage';

interface MessageInputProps {
  conversationId: string;
}

export default function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();

  const handleSend = () => {
    if (!message.trim() || isPending) return;

    sendMessage(
      {
        conversationId,
        type: 'text',
        content: { text: message.trim() },
      },
      {
        onSuccess: () => {
          setMessage('');
        },
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isPending}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!message.trim() || isPending}
        >
          {isPending ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>
    </Box>
  );
}
