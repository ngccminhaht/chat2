'use client';

import { useRef, useEffect } from 'react';
import { Box, Paper, Typography, Avatar, Stack, Link } from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { format } from 'date-fns';
import { Message, MessageContent } from '../types/conversation.types';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';

// Helper to extract media URL from various formats (Zalo uses attachments array)
function getMediaUrl(content: MessageContent): string | undefined {
  // Direct mediaUrl (outbound messages, normalized format)
  if (content.mediaUrl) return content.mediaUrl;
  if (content.url) return content.url;

  // Zalo inbound format: attachments[].payload.url or attachments[].payload.thumbnail
  if (content.attachments && Array.isArray(content.attachments) && content.attachments.length > 0) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.url) return attachment.payload.url;
    if (attachment?.payload?.thumbnail) return attachment.payload.thumbnail;
  }

  return undefined;
}

// Helper to get file name
function getFileName(content: MessageContent): string | undefined {
  if (content.fileName) return content.fileName;

  if (content.attachments && Array.isArray(content.attachments) && content.attachments.length > 0) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.name) return attachment.payload.name;
  }

  return undefined;
}

// Helper to get file size
function getFileSize(content: MessageContent): number | undefined {
  if (content.fileSize) return content.fileSize;

  if (content.attachments && Array.isArray(content.attachments) && content.attachments.length > 0) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.size) return attachment.payload.size;
  }

  return undefined;
}

// Format file size
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
        height: '100%',
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
                {message.type === 'image' && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <img
                        src={getMediaUrl(message.content)}
                        alt="Message attachment"
                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4, objectFit: 'contain' }}
                      />
                    ) : (
                      <Typography variant="body2">[Image]</Typography>
                    )}
                    {message.content.text && (
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {message.content.text}
                      </Typography>
                    )}
                  </Box>
                )}
                {message.type === 'file' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InsertDriveFileIcon />
                    <Box>
                      {getMediaUrl(message.content) ? (
                        <Link
                          href={getMediaUrl(message.content)}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ color: isOutbound ? 'inherit' : 'primary.main' }}
                        >
                          {getFileName(message.content) || 'Download file'}
                        </Link>
                      ) : (
                        <Typography variant="body2">
                          {getFileName(message.content) || 'File attachment'}
                        </Typography>
                      )}
                      {getFileSize(message.content) && (
                        <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                          {formatFileSize(getFileSize(message.content))}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
                {message.type === 'video' && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <video
                        src={getMediaUrl(message.content)}
                        controls
                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4 }}
                      />
                    ) : (
                      <Typography variant="body2">[Video]</Typography>
                    )}
                  </Box>
                )}
                {message.type === 'audio' && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <audio src={getMediaUrl(message.content)} controls style={{ width: '100%' }} />
                    ) : (
                      <Typography variant="body2">[Audio]</Typography>
                    )}
                  </Box>
                )}
                {message.type === 'sticker' && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <img
                        src={getMediaUrl(message.content)}
                        alt="Sticker"
                        style={{ maxWidth: 150, maxHeight: 150 }}
                      />
                    ) : (
                      <Typography variant="body2">[Sticker]</Typography>
                    )}
                  </Box>
                )}
                {message.type === 'location' && (
                  <Typography variant="body2">{message.content.text || '[Location]'}</Typography>
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
