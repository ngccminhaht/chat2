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

  const platformLabel = conversation.platform.toUpperCase();

  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={isActive}
        onClick={() => router.push(`/conversations/${conversation._id}`)}
      >
        <ListItemAvatar>
          <Badge badgeContent={conversation.unreadCount} color="error">
            <Avatar src={conversation.customerAvatar} alt={conversation.customerName}>
              {conversation.customerName?.charAt(0) || '?'}
            </Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
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
              <Typography component="span" variant="body2" color="text.secondary" noWrap display="block">
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
