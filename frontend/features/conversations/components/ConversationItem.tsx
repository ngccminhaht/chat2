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
}

export default function ConversationItem({ conversation, isActive }: ConversationItemProps) {
  const router = useRouter();

  const customer = conversation.participants.find((p) => p.role === 'customer');
  const platformLabel = conversation.platform.toUpperCase();

  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={isActive}
        onClick={() => router.push(`/conversations/${conversation._id}`)}
      >
        <ListItemAvatar>
          <Badge badgeContent={conversation.unreadCount} color="error">
            <Avatar src={customer?.avatar} alt={customer?.name}>
              {customer?.name?.charAt(0) || '?'}
            </Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
          primary={
            <>
              {customer?.name || 'Unknown'}
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
              <Typography variant="body2" color="text.secondary" noWrap>
                {conversation.lastMessage?.text || 'No messages yet'}
              </Typography>
              {conversation.lastMessage && (
                <Typography variant="caption" color="text.secondary">
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
