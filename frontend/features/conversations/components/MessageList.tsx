'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, Avatar, Stack } from '@mui/material';
import { format } from 'date-fns';
import { Message } from '../types/conversation.types';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (messages.length === 0) {
    return <EmptyState message="No messages yet" />;
  }

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflowY: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {messages.map((message) => {
        const isOutbound = message.direction === 'outbound';

        return (
          <Stack
            key={message._id}
            direction="row"
            spacing={1}
            sx={{
              justifyContent: isOutbound ? 'flex-end' : 'flex-start',
            }}
          >
            {!isOutbound && (
              <Avatar
                src={message.sender.avatar}
                alt={message.sender.name}
                sx={{ width: 32, height: 32 }}
              >
                {message.sender.name.charAt(0)}
              </Avatar>
            )}

            <Box sx={{ maxWidth: '70%' }}>
              {!isOutbound && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {message.sender.name}
                </Typography>
              )}

              <Paper
                sx={{
                  p: 1.5,
                  bgcolor: isOutbound ? 'primary.main' : 'background.paper',
                  color: isOutbound ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {message.type === 'text' && (
                  <Typography variant="body1">{message.content.text}</Typography>
                )}
                {message.type === 'image' && message.content.mediaUrl && (
                  <Box>
                    <img
                      src={message.content.mediaUrl}
                      alt="Message attachment"
                      style={{ maxWidth: '100%', borderRadius: 4 }}
                    />
                    {message.content.text && (
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {message.content.text}
                      </Typography>
                    )}
                  </Box>
                )}
                {message.type !== 'text' && message.type !== 'image' && (
                  <Typography variant="body2">
                    [{message.type.toUpperCase()}] {message.content.fileName || 'Attachment'}
                  </Typography>
                )}

                <Typography
                  variant="caption"
                  color={isOutbound ? 'primary.contrastText' : 'text.secondary'}
                  sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}
                >
                  {format(new Date(message.createdAt), 'HH:mm')}
                  {isOutbound && message.status !== 'sent' && ` · ${message.status}`}
                </Typography>
              </Paper>
            </Box>

            {isOutbound && (
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                A
              </Avatar>
            )}
          </Stack>
        );
      })}
      <div ref={messagesEndRef} />
    </Box>
  );
}
