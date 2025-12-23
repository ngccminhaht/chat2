'use client';

import {
  Popover,
  Typography,
  Avatar,
  Chip,
  Stack,
  Divider,
  Box,
} from '@mui/material';
import {
  Facebook as FacebookIcon,
  Chat as ChatIcon,
  ShoppingBag as ShoppingBagIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material';
import { Conversation } from '../types/conversation.types';

interface CustomerInfoPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  conversation: Conversation;
}

const platformIcons: Record<string, React.ReactNode> = {
  facebook: <FacebookIcon color="primary" />,
  zalo: <ChatIcon sx={{ color: '#0068ff' }} />,
  tiktok: <ShoppingBagIcon sx={{ color: '#000' }} />,
  shopee: <ShoppingBagIcon sx={{ color: '#ee4d2d' }} />,
};

const platformColors: Record<string, 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'> = {
  facebook: 'primary',
  zalo: 'info',
  tiktok: 'secondary',
  shopee: 'error',
};

export default function CustomerInfoPopover({ anchorEl, onClose, conversation }: CustomerInfoPopoverProps) {
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
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box sx={{ p: 2, minWidth: 280 }}>
        <Stack spacing={2}>
          {/* Customer Profile */}
          <Stack spacing={1} alignItems="center">
            <Avatar
              src={conversation.customerAvatar}
              alt={conversation.customerName}
              sx={{ width: 64, height: 64 }}
            >
              {conversation.customerName?.charAt(0) || 'U'}
            </Avatar>
            <Box textAlign="center">
              <Typography variant="subtitle1" fontWeight="bold">
                {conversation.customerName || 'Unknown User'}
              </Typography>
              <Chip
                icon={platformIcons[conversation.platform] as any}
                label={conversation.platform}
                size="small"
                color={platformColors[conversation.platform] || 'default'}
                variant="outlined"
              />
            </Box>
          </Stack>

          <Divider />

          {/* Details */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              <TimeIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
              Details
            </Typography>
            <Stack spacing={0.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">Created</Typography>
                <Typography variant="body2">{formatDate(conversation.createdAt)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Last Updated</Typography>
                <Typography variant="body2">{formatDate(conversation.updatedAt)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Platform ID</Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>
                  {conversation.customerPlatformUserId}
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Popover>
  );
}
