'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  Chip,
  Stack,
  Divider,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Switch,
  Box,
} from '@mui/material';
import {
  Close as CloseIcon,
  LocalOffer as TagIcon,
  SmartToy as AiIcon,
} from '@mui/icons-material';
import { Conversation } from '../types/conversation.types';
import { useUpdateConversation } from '../hooks/useUpdateConversation';
import { useState, useEffect } from 'react';

interface ConversationSettingsModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
}

export default function ConversationSettingsModal({ open, onClose, conversation }: ConversationSettingsModalProps) {
  const { mutate: updateConversation, isPending } = useUpdateConversation();
  const [tagInput, setTagInput] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(conversation.tags || []);

  useEffect(() => {
    setLocalTags(conversation.tags || []);
  }, [conversation.tags]);

  const handleStatusChange = (newStatus: 'open' | 'closed' | 'archived') => {
    updateConversation({
      conversationId: conversation._id,
      data: { status: newStatus },
    });
  };

  const handleAddTag = (tag: string) => {
    if (tag && !localTags.includes(tag)) {
      const newTags = [...localTags, tag];
      setLocalTags(newTags);
      updateConversation({
        conversationId: conversation._id,
        data: { tags: newTags },
      });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = localTags.filter((t) => t !== tagToRemove);
    setLocalTags(newTags);
    updateConversation({
      conversationId: conversation._id,
      data: { tags: newTags },
    });
  };

  const handleAiToggle = (enabled: boolean) => {
    updateConversation({
      conversationId: conversation._id,
      data: { aiEnabled: enabled },
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Conversation Settings</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {/* Status */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Status
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={conversation.status || 'open'}
                onChange={(e) => handleStatusChange(e.target.value as any)}
                disabled={isPending}
              >
                <MenuItem value="open">
                  <Chip label="Open" size="small" color="success" sx={{ mr: 1 }} />
                </MenuItem>
                <MenuItem value="closed">
                  <Chip label="Closed" size="small" color="default" sx={{ mr: 1 }} />
                </MenuItem>
                <MenuItem value="archived">
                  <Chip label="Archived" size="small" color="warning" sx={{ mr: 1 }} />
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Divider />

          {/* AI Auto-Reply */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  <AiIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                  AI Auto-Reply
                </Typography>
                <Typography variant="body2" color={conversation.aiEnabled !== false ? 'success.main' : 'text.secondary'}>
                  {conversation.aiEnabled !== false ? 'Enabled' : 'Disabled'}
                </Typography>
              </Box>
              <Switch
                checked={conversation.aiEnabled !== false}
                onChange={(e) => handleAiToggle(e.target.checked)}
                disabled={isPending}
                color="success"
              />
            </Stack>
            {conversation.aiState && conversation.aiState !== 'AI_ACTIVE' && (
              <Chip
                label={conversation.aiState === 'BATCHING' ? 'Batching...' : 'AI Responding...'}
                size="small"
                color="info"
                sx={{ mt: 1 }}
              />
            )}
          </Box>

          <Divider />

          {/* Tags */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              <TagIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
              Tags
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} mb={1}>
              {localTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onDelete={() => handleRemoveTag(tag)}
                  disabled={isPending}
                />
              ))}
              {localTags.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No tags
                </Typography>
              )}
            </Stack>
            <TextField
              size="small"
              fullWidth
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  handleAddTag(tagInput.trim());
                }
              }}
              disabled={isPending}
            />
          </Box>

          {isPending && (
            <Box display="flex" justifyContent="center">
              <CircularProgress size={20} />
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
