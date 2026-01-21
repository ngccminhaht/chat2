import { useRouter } from 'next/navigation';
import {
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Chip,
  Badge,
} from '@mui/material';
import { Conversation } from '../types/conversation.types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationItemProps {
  conversation: Conversation;
  isActive?: boolean;
  orgSlug: string;
}

export default function ConversationItem({ conversation, isActive, orgSlug }: ConversationItemProps) {
  const router = useRouter();

  const platformLabel = conversation.platform.toUpperCase();

  // Show combined count: unread messages + unsent messages (exceeded timeout)
  const totalBadgeCount = (conversation.unreadCount || 0) + (conversation.unsentCount || 0);

  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={isActive}
        onClick={() => router.push(`/organizations/${orgSlug}/conversations/${conversation._id}`)}
      >
        <ListItemAvatar>
          <Badge badgeContent={totalBadgeCount} color="error">
            <Avatar src={conversation.customerAvatar} alt={conversation.customerName}>
              {conversation.customerName?.charAt(0) || '?'}
            </Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
          sx={{ overflow: 'hidden', minWidth: 0 }}
          primary={
            <>
              {conversation.customerName || 'Unknown'}
              <Chip
                label={platformLabel}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            </>
          }
          secondary={
            <>
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
                }}
              >
                {conversation.lastMessage?.text || 'No messages yet'}
              </Typography>
              {conversation.lastMessage && (
                <Typography component="span" variant="caption" color="text.secondary" display="block">
                  {formatDistanceToNow(new Date(conversation.lastMessage.timestamp), {
                    addSuffix: true,
                  })}
                </Typography>
              )}
            </>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}
