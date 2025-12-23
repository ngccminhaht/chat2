'use client';

import {
  Box,
  Paper,
  Typography,
  Avatar,
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
} from '@mui/material';
import {
  Close as CloseIcon,
  Facebook as FacebookIcon,
  Chat as ChatIcon,
  ShoppingBag as ShoppingBagIcon,
  LocalOffer as TagIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
  SmartToy as AiIcon,
} from '@mui/icons-material';
import { Conversation } from '../types/conversation.types';
import { useUpdateConversation } from '../hooks/useUpdateConversation';
import { useAgents } from '../hooks/useAgents';
import { useActiveAiAgents } from '@/features/ai-agents/hooks/useAiAgents';
import { useState, useEffect } from 'react';

interface CustomerInfoPanelProps {
  conversation: Conversation;
  onClose?: () => void;
}

// Platform icon mapping
const platformIcons: Record<string, React.ReactNode> = {
  facebook: <FacebookIcon color="primary" />,
  zalo: <ChatIcon sx={{ color: '#0068ff' }} />,
  tiktok: <ShoppingBagIcon sx={{ color: '#000' }} />,
  shopee: <ShoppingBagIcon sx={{ color: '#ee4d2d' }} />,
};

// Platform colors for chips
const platformColors: Record<string, 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'> = {
  facebook: 'primary',
  zalo: 'info',
  tiktok: 'secondary',
  shopee: 'error',
};

export default function CustomerInfoPanel({ conversation, onClose }: CustomerInfoPanelProps) {
  const { mutate: updateConversation, isPending } = useUpdateConversation();
  const { data: agentsData, isLoading: isLoadingAgents } = useAgents();
  const { data: aiAgents, isLoading: isLoadingAiAgents } = useActiveAiAgents();

  const [tagInput, setTagInput] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(conversation.tags || []);

  // Sync local tags with conversation
  useEffect(() => {
    setLocalTags(conversation.tags || []);
  }, [conversation.tags]);

  const agents = agentsData?.data || [];
  const activeAiAgents = aiAgents || [];

  // Handle status change
  const handleStatusChange = (newStatus: 'open' | 'closed' | 'archived') => {
    updateConversation({
      conversationId: conversation._id,
      data: { status: newStatus },
    });
  };

  // Handle assignment change
  const handleAssignmentChange = (agentId: string | null) => {
    updateConversation({
      conversationId: conversation._id,
      data: { assignedTo: agentId },
    });
  };

  // Handle tag add
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

  // Handle tag remove
  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = localTags.filter((t) => t !== tagToRemove);
    setLocalTags(newTags);
    updateConversation({
      conversationId: conversation._id,
      data: { tags: newTags },
    });
  };

  // Handle AI toggle
  const handleAiToggle = (enabled: boolean) => {
    updateConversation({
      conversationId: conversation._id,
      data: { aiEnabled: enabled },
    });
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight="bold">
            Customer Info
          </Typography>
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Box>

      {/* Scrollable Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={3}>
          {/* Customer Profile */}
          <Stack spacing={2} alignItems="center">
            <Avatar
              src={conversation.customerAvatar}
              alt={conversation.customerName}
              sx={{ width: 80, height: 80 }}
            >
              {conversation.customerName?.charAt(0) || 'U'}
            </Avatar>
            <Box textAlign="center">
              <Typography variant="h6">{conversation.customerName || 'Unknown User'}</Typography>
              <Stack direction="row" spacing={1} justifyContent="center" mt={0.5}>
                <Chip
                  icon={platformIcons[conversation.platform] as any}
                  label={conversation.platform}
                  size="small"
                  color={platformColors[conversation.platform] || 'default'}
                  variant="outlined"
                />
              </Stack>
            </Box>
          </Stack>

          <Divider />

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

          {/* Assignment */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              <PersonIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
              Assigned To
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={conversation.assignedTo?._id || ''}
                onChange={(e) => handleAssignmentChange(e.target.value || null)}
                disabled={isPending || isLoadingAgents || isLoadingAiAgents}
                displayEmpty
              >
                <MenuItem value="">
                  <em>Unassigned</em>
                </MenuItem>

                {/* AI Agents Section */}
                {activeAiAgents.length > 0 && (
                  <MenuItem disabled sx={{ opacity: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      <AiIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                      AI Agents
                    </Typography>
                  </MenuItem>
                )}
                {activeAiAgents.map((aiAgent) => (
                  <MenuItem key={`ai-${aiAgent._id}`} value={`ai:${aiAgent._id}`}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar sx={{ width: 24, height: 24, bgcolor: 'secondary.main' }}>
                        <AiIcon sx={{ fontSize: 16 }} />
                      </Avatar>
                      <Typography variant="body2">{aiAgent.name}</Typography>
                      <Chip label="AI" size="small" color="secondary" sx={{ height: 18 }} />
                    </Stack>
                  </MenuItem>
                ))}

                {/* Human Agents Section */}
                {agents.length > 0 && (
                  <MenuItem disabled sx={{ opacity: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      <PersonIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                      Team Members
                    </Typography>
                  </MenuItem>
                )}
                {agents.map((agent) => (
                  <MenuItem key={agent._id} value={agent._id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar src={agent.avatar} sx={{ width: 24, height: 24 }}>
                        {agent.name?.charAt(0)}
                      </Avatar>
                      <Typography variant="body2">{agent.name}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {conversation.assignedTo && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {conversation.assignedTo.email}
              </Typography>
            )}
          </Box>

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

          <Divider />

          {/* Metadata */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              <TimeIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
              Details
            </Typography>
            <Stack spacing={1}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">{formatDate(conversation.createdAt)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Last Updated
                </Typography>
                <Typography variant="body2">{formatDate(conversation.updatedAt)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Platform ID
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {conversation.customerPlatformUserId}
                </Typography>
              </Box>
            </Stack>
          </Box>

          {isPending && (
            <Box display="flex" justifyContent="center">
              <CircularProgress size={20} />
            </Box>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
