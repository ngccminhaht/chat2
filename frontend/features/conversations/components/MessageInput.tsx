'use client';

import { useState, useRef } from 'react';
import { Box, TextField, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useSendMessage } from '../hooks/useSendMessage';

interface MessageInputProps {
  conversationId: string;
}

export default function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();
  const isSendingRef = useRef(false);

  const handleSend = () => {
    if (!message.trim() || isPending || isSendingRef.current) return;

    isSendingRef.current = true;
    const messageToSend = message.trim();
    setMessage(''); // Clear immediately for better UX

    sendMessage(
      {
        conversationId,
        type: 'text',
        content: { text: messageToSend },
      },
      {
        onSuccess: () => {
          isSendingRef.current = false;
        },
        onError: () => {
          isSendingRef.current = false;
          setMessage(messageToSend); // Restore message on error
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          size="small"
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!message.trim() || isPending}
          size="large"
        >
          {isPending ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>
    </Box>
  );
}
