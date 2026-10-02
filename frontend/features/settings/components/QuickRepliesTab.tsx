'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  CardActions,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  useQuickReplies,
  useCreateQuickReply,
  useUpdateQuickReply,
  useDeleteQuickReply,
} from '@/features/quick-replies/hooks/useQuickReplies';
import {
  QuickReply,
  CreateQuickReplyDto,
} from '@/features/quick-replies/types/quick-reply.types';

const defaultForm: CreateQuickReplyDto = {
  title: '',
  shortcut: '',
  content: '',
  tags: [],
};

export default function QuickRepliesTab() {
  const { data: quickRepliesData, isLoading } = useQuickReplies();
  const createQuickReply = useCreateQuickReply();
  const updateQuickReply = useUpdateQuickReply();
  const deleteQuickReply = useDeleteQuickReply();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [form, setForm] = useState<CreateQuickReplyDto>(defaultForm);
  const [tagInput, setTagInput] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<QuickReply | null>(null);

  const handleOpenDialog = (reply?: QuickReply) => {
    if (reply) {
      setEditingReply(reply);
      setForm({
        title: reply.title,
        shortcut: reply.shortcut,
        content: reply.content,
        tags: reply.tags,
      });
    } else {
      setEditingReply(null);
      setForm(defaultForm);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingReply(null);
    setForm(defaultForm);
    setTagInput('');
  };

  const handleSave = () => {
    if (editingReply) {
      updateQuickReply.mutate(
        { id: editingReply._id, dto: form },
        { onSuccess: handleCloseDialog }
      );
    } else {
      createQuickReply.mutate(form, { onSuccess: handleCloseDialog });
    }
  };

  const handleDelete = (reply: QuickReply) => {
    setReplyToDelete(reply);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (replyToDelete) {
      deleteQuickReply.mutate(replyToDelete._id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setReplyToDelete(null);
        },
      });
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !form.tags?.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...(form.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setForm({ ...form, tags: form.tags?.filter((t) => t !== tagToRemove) });
  };

  const handleToggleActive = (reply: QuickReply) => {
    updateQuickReply.mutate({ id: reply._id, dto: { isActive: !reply.isActive } });
  };

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600 }}>Tin nhắn mẫu</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={() => handleOpenDialog()}
          sx={{
            bgcolor: "#0060df",
            "&:hover": { bgcolor: "#004ecc" },
            borderRadius: "6px",
            fontSize: "12.5px",
            px: 1.75,
            py: 0.75,
          }}
        >
          Thêm tin nhắn mẫu
        </Button>
      </Stack>

      <Alert severity="info">
        Quick replies are predefined responses. Type / followed by the shortcut in the message input
        to quickly insert them.
      </Alert>

      {isLoading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {quickRepliesData?.data.map((reply) => (
            <Card key={reply._id} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle1" fontWeight="bold">
                        {reply.title}
                      </Typography>
                      <Chip
                        label={`/${reply.shortcut}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      <Chip
                        label={reply.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={reply.isActive ? 'success' : 'default'}
                      />
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      mt={1}
                      sx={{
                        whiteSpace: 'pre-wrap',
                        maxHeight: 80,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {reply.content}
                    </Typography>
                    {reply.tags.length > 0 && (
                      <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap" gap={0.5}>
                        {reply.tags.map((tag) => (
                          <Chip key={tag} label={tag} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                      Used {reply.usageCount} times
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  onClick={() => handleToggleActive(reply)}
                  disabled={updateQuickReply.isPending}
                >
                  {reply.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <IconButton size="small" onClick={() => handleOpenDialog(reply)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(reply)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {!isLoading && (!quickRepliesData?.data || quickRepliesData.data.length === 0) && (
        <Alert severity="info">No quick replies configured. Create one to get started.</Alert>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingReply ? 'Edit Quick Reply' : 'Create Quick Reply'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <TextField
              label="Shortcut"
              fullWidth
              required
              placeholder="e.g., hello, thanks, bye"
              helperText="Type /{shortcut} in message input to use"
              value={form.shortcut}
              onChange={(e) =>
                setForm({ ...form, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })
              }
            />

            <TextField
              label="Content"
              fullWidth
              required
              multiline
              rows={4}
              placeholder="Enter the message content..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />

            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Tags
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} mb={1}>
                {form.tags?.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => handleRemoveTag(tag)}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  sx={{ flexGrow: 1 }}
                />
                <Button variant="outlined" size="small" onClick={handleAddTag}>
                  Add
                </Button>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              createQuickReply.isPending ||
              updateQuickReply.isPending ||
              !form.title ||
              !form.shortcut ||
              !form.content
            }
          >
            {createQuickReply.isPending || updateQuickReply.isPending ? (
              <CircularProgress size={20} />
            ) : editingReply ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Quick Reply</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{replyToDelete?.title}&quot;? This action cannot
            be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deleteQuickReply.isPending}
          >
            {deleteQuickReply.isPending ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
