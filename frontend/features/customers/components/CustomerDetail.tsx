'use client';

import {
  Box,
  Avatar,
  Typography,
  Divider,
  TextField,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import ComputerIcon from '@mui/icons-material/Computer';
import LanguageIcon from '@mui/icons-material/Language';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { Customer } from '../types/customer.types';
import { useUpdateCustomer } from '../hooks/useCustomer';
import { useState } from 'react';
import { format } from 'date-fns';

interface CustomerDetailProps {
  customer: Customer;
  onClose?: () => void;
}

export default function CustomerDetail({ customer }: CustomerDetailProps) {
  const [notes, setNotes] = useState(customer.notes || '');
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(customer.tags || []);
  const updateCustomer = useUpdateCustomer();

  const handleSaveNotes = () => {
    updateCustomer.mutate({
      customerId: customer._id,
      data: { notes },
    });
  };

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      const updatedTags = [...tags, newTag];
      setTags(updatedTags);
      setNewTag('');
      updateCustomer.mutate({
        customerId: customer._id,
        data: { tags: updatedTags },
      });
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = tags.filter((t) => t !== tagToRemove);
    setTags(updatedTags);
    updateCustomer.mutate({
      customerId: customer._id,
      data: { tags: updatedTags },
    });
  };

  const deviceString = customer.deviceInfo
    ? `${customer.deviceInfo.browser || ''} on ${customer.deviceInfo.os || 'Unknown'} (${customer.deviceInfo.device || 'desktop'})`
    : 'Unknown';

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Avatar sx={{ width: 64, height: 64 }} src={customer.avatar}>
          {customer.name?.charAt(0)?.toUpperCase() || 'V'}
        </Avatar>
        <Box>
          <Typography variant="h6">{customer.name || 'Visitor'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {customer.totalConversations} conversations · {customer.totalMessages} messages
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <List dense>
        {customer.email && (
          <ListItem>
            <ListItemIcon>
              <EmailIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={customer.email} secondary="Email" />
          </ListItem>
        )}
        {customer.phone && (
          <ListItem>
            <ListItemIcon>
              <PhoneIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={customer.phone} secondary="Phone" />
          </ListItem>
        )}
        <ListItem>
          <ListItemIcon>
            <ComputerIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={deviceString} secondary="Device" />
        </ListItem>
        {customer.lastSeenDomain && (
          <ListItem>
            <ListItemIcon>
              <LanguageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={customer.lastSeenDomain}
              secondary={`Last seen domain (${customer.domains?.length || 1} total)`}
            />
          </ListItem>
        )}
        {customer.location?.country && (
          <ListItem>
            <ListItemIcon>
              <LocationOnIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={`${customer.location.city || ''} ${customer.location.country}`}
              secondary="Location"
            />
          </ListItem>
        )}
        <ListItem>
          <ListItemIcon>
            <AccessTimeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={
              customer.lastSeenAt
                ? format(new Date(customer.lastSeenAt), 'PPp')
                : '-'
            }
            secondary="Last seen"
          />
        </ListItem>
        <ListItem>
          <ListItemIcon>
            <ChatBubbleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={
              customer.firstSeenAt
                ? format(new Date(customer.firstSeenAt), 'PPp')
                : '-'
            }
            secondary="First seen"
          />
        </ListItem>
      </List>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Tags
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
        {tags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onDelete={() => handleRemoveTag(tag)}
            sx={{ mb: 0.5 }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          placeholder="Add tag"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={handleAddTag}
          disabled={updateCustomer.isPending}
        >
          Add
        </Button>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Notes
      </Typography>
      <TextField
        multiline
        rows={4}
        fullWidth
        placeholder="Add notes about this customer..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        sx={{ mb: 1 }}
      />
      <Button
        variant="contained"
        size="small"
        onClick={handleSaveNotes}
        disabled={notes === customer.notes || updateCustomer.isPending}
      >
        {updateCustomer.isPending ? 'Saving...' : 'Save Notes'}
      </Button>

      {customer.referrer && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Source
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Referrer: {customer.referrer}
          </Typography>
          {customer.landingPage && (
            <Typography variant="body2" color="text.secondary">
              Landing: {customer.landingPage}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
