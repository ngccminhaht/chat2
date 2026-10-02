'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Box,
  Stack,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import {
  useOrganizationMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from '../hooks/useOrganizationMembers';
import { useAuthStore } from '@/features/auth/stores/authStore';
import type { OrganizationRole, OrganizationMember } from '../types/organization.types';

const ROLE_COLORS: Record<OrganizationRole, 'default' | 'primary' | 'secondary' | 'info'> = {
  owner: 'primary',
  admin: 'secondary',
  agent: 'info', // Legacy
  viewer: 'default',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function OrganizationMembers() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { data: members, isLoading } = useOrganizationMembers();
  const inviteMember = useInviteMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const currentUserId = useAuthStore((state) => state.user?.id);
  const currentRole = useAuthStore((state) => state.getCurrentRole());
  const isOwner = currentRole === 'owner';
  const canManage = isOwner || currentRole === 'admin';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('viewer');

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail || !isValidEmail(inviteEmail)) return;
    try {
      await inviteMember.mutateAsync({ email: inviteEmail.toLowerCase().trim(), role: inviteRole });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
    } catch {
      // Error handled by mutation
    }
  };

  const handleRoleChange = (userId: string, newRole: OrganizationRole) => {
    updateRole.mutate({ userId, role: newRole });
  };

  const handleRemoveClick = (member: OrganizationMember) => {
    setMemberToRemove(member);
    setRemoveDialogOpen(true);
  };

  const confirmRemove = () => {
    if (memberToRemove) {
      removeMember.mutate(memberToRemove.userId._id, {
        onSuccess: () => {
          setRemoveDialogOpen(false);
          setMemberToRemove(null);
        },
      });
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600 }}>
          {t('title')}
        </Typography>
        {canManage && (
          <Button
            variant="contained"
            size="small"
            startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
            onClick={() => setInviteOpen(true)}
            sx={{
              bgcolor: "#0060df",
              "&:hover": { bgcolor: "#004ecc" },
              borderRadius: "6px",
              fontSize: "12.5px",
              px: 1.75,
              py: 0.75,
            }}
          >
            {t('invite')}
          </Button>
        )}
      </Stack>

      <Divider />

      {inviteMember.isError && (
        <Alert severity="error">
          {t('inviteFailed')}
        </Alert>
      )}

      <List>
        {members?.map((member) => {
          const isCurrentUser = member.userId._id === currentUserId;
          const isMemberOwner = member.role === 'owner';

          return (
            <ListItem
              key={member.id}
              secondaryAction={
                canManage && !isMemberOwner && !isCurrentUser ? (
                  <IconButton
                    edge="end"
                    color="error"
                    onClick={() => handleRemoveClick(member)}
                    disabled={removeMember.isPending}
                  >
                    <DeleteIcon />
                  </IconButton>
                ) : null
              }
            >
              <ListItemAvatar>
                <Avatar src={member.userId.avatarUrl}>
                  {member.userId.name?.charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body1">
                      {member.userId.name}
                      {isCurrentUser && ` (${tc('you')})`}
                    </Typography>
                    {isOwner && !isMemberOwner ? (
                      <FormControl size="small" variant="standard">
                        <Select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.userId._id, e.target.value as OrganizationRole)
                          }
                          disabled={updateRole.isPending}
                        >
                          <MenuItem value="admin">{t('roles.admin')}</MenuItem>
                          <MenuItem value="viewer">{t('roles.viewer')}</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <Chip
                        label={t(`roles.${member.role}`)}
                        size="small"
                        color={ROLE_COLORS[member.role]}
                        variant="outlined"
                      />
                    )}
                  </Stack>
                }
                secondary={member.userId.email}
              />
            </ListItem>
          );
        })}
      </List>

      {(!members || members.length === 0) && (
        <Alert severity="info">{t('noMembers')}</Alert>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('inviteMember')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              label={t('emailLabel')}
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              fullWidth
              autoFocus
              error={inviteEmail.length > 0 && !isValidEmail(inviteEmail)}
              helperText={inviteEmail.length > 0 && !isValidEmail(inviteEmail) ? t('invalidEmail') : ''}
            />
            <FormControl fullWidth>
              <InputLabel>{t('roleLabel')}</InputLabel>
              <Select
                value={inviteRole}
                label={t('roleLabel')}
                onChange={(e) => setInviteRole(e.target.value as OrganizationRole)}
              >
                <MenuItem value="admin">{t('roleDescriptions.admin')}</MenuItem>
                <MenuItem value="viewer">{t('roleDescriptions.viewer')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteOpen(false)}>{tc('cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleInvite}
            disabled={!inviteEmail || !isValidEmail(inviteEmail) || inviteMember.isPending}
          >
            {inviteMember.isPending ? <CircularProgress size={20} /> : t('sendInvite')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onClose={() => setRemoveDialogOpen(false)}>
        <DialogTitle>{t('removeMember')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('removeConfirm', { name: memberToRemove?.userId.name || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialogOpen(false)}>{tc('cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmRemove}
            disabled={removeMember.isPending}
          >
            {removeMember.isPending ? <CircularProgress size={20} /> : tc('remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
