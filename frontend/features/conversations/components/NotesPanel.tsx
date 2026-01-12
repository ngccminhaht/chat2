'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Stack,
  Avatar,
  Chip,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
} from '@mui/material';
import {
  Note as NoteIcon,
  Send as SendIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import {
  useConversationNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from '../hooks/useConversationNotes';
import { ConversationNote, ConversationNoteUser } from '../types/conversation.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface NotesPanelProps {
  conversationId: string;
}

export default function NotesPanel({ conversationId }: NotesPanelProps) {
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [anchorEl, setAnchorEl] = useState<{ el: HTMLElement; noteId: string } | null>(null);

  const currentUser = useAuthStore((state) => state.user);
  const { data: notes = [], isLoading } = useConversationNotes({ conversationId });
  const { mutate: createNote, isPending: isCreating } = useCreateNote();
  const { mutate: updateNote, isPending: isUpdating } = useUpdateNote();
  const { mutate: deleteNote, isPending: isDeleting } = useDeleteNote();

  const handleCreateNote = () => {
    if (!newNoteContent.trim() || isCreating) return;

    createNote(
      {
        conversationId,
        data: {
          content: newNoteContent.trim(),
          isPrivate,
        },
      },
      {
        onSuccess: () => {
          setNewNoteContent('');
          setIsPrivate(false);
        },
      }
    );
  };

  const handleStartEdit = (note: ConversationNote) => {
    setEditingNoteId(note._id);
    setEditingContent(note.content);
    setAnchorEl(null);
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  const handleSaveEdit = () => {
    if (!editingNoteId || !editingContent.trim() || isUpdating) return;

    updateNote(
      {
        conversationId,
        noteId: editingNoteId,
        data: { content: editingContent.trim() },
      },
      {
        onSuccess: () => {
          setEditingNoteId(null);
          setEditingContent('');
        },
      }
    );
  };

  const handleDelete = (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    deleteNote(
      { conversationId, noteId },
      {
        onSuccess: () => {
          setAnchorEl(null);
        },
      }
    );
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, noteId: string) => {
    setAnchorEl({ el: event.currentTarget, noteId });
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const getUserName = (user: string | ConversationNoteUser): string => {
    if (typeof user === 'string') return 'Unknown';
    return user.name || user.email || 'Unknown';
  };

  const getUserAvatar = (user: string | ConversationNoteUser): string | undefined => {
    if (typeof user === 'string') return undefined;
    return user.avatarUrl;
  };

  const isNoteOwner = (note: ConversationNote): boolean => {
    if (!currentUser) return false;
    if (typeof note.userId === 'string') {
      return note.userId === currentUser.id;
    }
    return note.userId._id === currentUser.id;
  };

  const canEditNote = (note: ConversationNote): boolean => {
    return isNoteOwner(note);
  };

  const canDeleteNote = (note: ConversationNote): boolean => {
    return isNoteOwner(note);
  };

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <NoteIcon fontSize="small" />
          <Typography variant="h6">Notes</Typography>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        {isLoading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress size={24} />
          </Box>
        ) : notes.length === 0 ? (
          <Alert severity="info">No notes yet. Add a note to share information with your team.</Alert>
        ) : (
          <Stack spacing={2}>
            {notes.map((note) => (
              <Box key={note._id}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Avatar
                    src={getUserAvatar(note.userId)}
                    sx={{ width: 32, height: 32 }}
                  >
                    {getUserName(note.userId).charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <Typography variant="body2" fontWeight="medium">
                        {getUserName(note.userId)}
                      </Typography>
                      {note.isPrivate && (
                        <Chip
                          icon={<LockIcon sx={{ fontSize: '14px !important' }} />}
                          label="Private"
                          size="small"
                          color="default"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                      </Typography>
                      {(canEditNote(note) || canDeleteNote(note)) && (
                        <>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, note._id)}
                            sx={{ ml: 'auto' }}
                          >
                            <MoreIcon fontSize="small" />
                          </IconButton>
                          <Menu
                            anchorEl={anchorEl?.noteId === note._id ? anchorEl.el : null}
                            open={anchorEl?.noteId === note._id}
                            onClose={handleMenuClose}
                          >
                            {canEditNote(note) && (
                              <MenuItem onClick={() => handleStartEdit(note)}>
                                <ListItemIcon>
                                  <EditIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>Edit</ListItemText>
                              </MenuItem>
                            )}
                            {canDeleteNote(note) && (
                              <MenuItem onClick={() => handleDelete(note._id)}>
                                <ListItemIcon>
                                  <DeleteIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>Delete</ListItemText>
                              </MenuItem>
                            )}
                          </Menu>
                        </>
                      )}
                    </Stack>
                    {editingNoteId === note._id ? (
                      <Box>
                        <TextField
                          fullWidth
                          multiline
                          rows={3}
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          size="small"
                          sx={{ mb: 1 }}
                        />
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={handleSaveEdit}
                            disabled={!editingContent.trim() || isUpdating}
                            color="primary"
                          >
                            {isUpdating ? (
                              <CircularProgress size={16} />
                            ) : (
                              <SendIcon fontSize="small" />
                            )}
                          </IconButton>
                          <IconButton size="small" onClick={handleCancelEdit}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {note.content}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          placeholder="Add a note..."
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleCreateNote();
            }
          }}
          disabled={isCreating}
          size="small"
          sx={{ mb: 1 }}
        />
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <FormControlLabel
            control={
              <Switch
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                size="small"
              />
            }
            label={
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {isPrivate ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                <Typography variant="caption">Private</Typography>
              </Stack>
            }
          />
          <IconButton
            color="primary"
            onClick={handleCreateNote}
            disabled={!newNoteContent.trim() || isCreating}
            size="small"
          >
            {isCreating ? <CircularProgress size={20} /> : <SendIcon />}
          </IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Press Ctrl+Enter to send
        </Typography>
      </Box>
    </Paper>
  );
}

