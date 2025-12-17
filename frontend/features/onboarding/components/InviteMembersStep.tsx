'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useBulkInviteMembers } from '../hooks/useInviteMembers';
import type { InviteMemberRequest } from '../types/onboarding.types';
import OnboardingProgress from './OnboardingProgress';

const ROLE_LABELS = {
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function InviteMembersStep() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'agent' | 'viewer'>('agent');
  const [invites, setInvites] = useState<InviteMemberRequest[]>([]);

  const bulkInvite = useBulkInviteMembers();

  const canAddInvite = email && isValidEmail(email) && !invites.some((i) => i.email === email);

  const handleAddInvite = () => {
    if (canAddInvite) {
      setInvites([...invites, { email: email.toLowerCase().trim(), role }]);
      setEmail('');
    }
  };

  const handleRemoveInvite = (emailToRemove: string) => {
    setInvites(invites.filter((i) => i.email !== emailToRemove));
  };

  const handleSendInvites = async () => {
    if (invites.length > 0) {
      try {
        await bulkInvite.mutateAsync(invites);
        router.push('/organizations');
      } catch {
        // Error handled by mutation state
      }
    }
  };

  const handleSkip = () => {
    router.push('/organizations');
  };

  const handleComplete = () => {
    router.push('/organizations');
  };

  return (
    <Stack spacing={4}>
      <OnboardingProgress />

      <Box>
        <Typography variant="h4" gutterBottom>
          Invite Team Members
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Add team members to help manage conversations.
        </Typography>
      </Box>

      {bulkInvite.isError && (
        <Alert severity="error">Failed to send some invitations. Please try again.</Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="flex-end">
        <TextField
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          placeholder="colleague@example.com"
          error={email.length > 0 && !isValidEmail(email)}
          helperText={email.length > 0 && !isValidEmail(email) ? 'Enter a valid email' : ''}
        />
        <FormControl fullWidth>
          <InputLabel>Role</InputLabel>
          <Select
            value={role}
            label="Role"
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="agent">Agent</MenuItem>
            <MenuItem value="viewer">Viewer</MenuItem>
          </Select>
        </FormControl>
        <IconButton
          color="primary"
          onClick={handleAddInvite}
          disabled={!canAddInvite}
        >
          <AddIcon />
        </IconButton>
      </Stack>

      {invites.length > 0 && (
        <List>
          {invites.map((invite) => (
            <ListItem key={invite.email} divider>
              <ListItemText
                primary={invite.email}
                secondary={
                  <Chip
                    label={ROLE_LABELS[invite.role]}
                    size="small"
                    variant="outlined"
                  />
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  onClick={() => handleRemoveInvite(invite.email)}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button variant="text" onClick={handleSkip}>
          Skip for now
        </Button>
        <Stack direction="row" spacing={2}>
          {invites.length > 0 && (
            <Button
              variant="outlined"
              onClick={handleSendInvites}
              disabled={bulkInvite.isPending}
            >
              {bulkInvite.isPending ? (
                <CircularProgress size={20} />
              ) : (
                `Send ${invites.length} Invite${invites.length > 1 ? 's' : ''}`
              )}
            </Button>
          )}
          <Button variant="contained" onClick={handleComplete}>
            Complete Setup
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
