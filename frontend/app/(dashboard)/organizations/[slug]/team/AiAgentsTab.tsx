'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Button,
  Avatar,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  CardActions,
  TextField,
} from '@mui/material';
import {
  SmartToy as AiIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  useAiAgents,
  useCreateAiAgent,
  useUpdateAiAgent,
  useDeleteAiAgent,
} from '@/features/ai-agents/hooks/useAiAgents';
import {
  AiAgent,
  AiProvider,
  AiAgentStatus,
  CreateAiAgentDto,
} from '@/features/ai-agents/types/ai-agent.types';

const defaultAiAgentForm: CreateAiAgentDto = {
  name: '',
  description: '',
  provider: AiProvider.CUSTOM,
  model: '',
  systemPrompt: '',
  webhookUrl: '',
  apiKey: '',
};

export default function AiAgentsTab() {
  const { data: aiAgentsData, isLoading } = useAiAgents();
  const createAiAgent = useCreateAiAgent();
  const updateAiAgent = useUpdateAiAgent();
  const deleteAiAgent = useDeleteAiAgent();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [form, setForm] = useState<CreateAiAgentDto>(defaultAiAgentForm);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AiAgent | null>(null);

  const handleOpenDialog = (agent?: AiAgent) => {
    if (agent) {
      setEditingAgent(agent);
      setForm({
        name: agent.name,
        description: agent.description || '',
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt || '',
        webhookUrl: agent.webhookUrl || '',
        apiKey: '',
      });
    } else {
      setEditingAgent(null);
      setForm(defaultAiAgentForm);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAgent(null);
    setForm(defaultAiAgentForm);
  };

  const handleSave = () => {
    if (editingAgent) {
      updateAiAgent.mutate(
        { id: editingAgent._id, dto: form },
        { onSuccess: handleCloseDialog }
      );
    } else {
      createAiAgent.mutate(form, { onSuccess: handleCloseDialog });
    }
  };

  const handleDelete = (agent: AiAgent) => {
    setAgentToDelete(agent);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (agentToDelete) {
      deleteAiAgent.mutate(agentToDelete._id, {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setAgentToDelete(null);
        },
      });
    }
  };

  const handleToggleStatus = (agent: AiAgent) => {
    const newStatus =
      agent.status === AiAgentStatus.ACTIVE ? AiAgentStatus.INACTIVE : AiAgentStatus.ACTIVE;
    updateAiAgent.mutate({ id: agent._id, dto: { status: newStatus } });
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">AI Agents</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add AI Agent
        </Button>
      </Stack>

      <Alert severity="info">
        AI Agents can automatically respond to customers when assigned to conversations.
        Configure webhook URL to connect to your external AI platform.
      </Alert>

      <Stack spacing={2}>
        {aiAgentsData?.data.map((agent) => (
          <Card key={agent._id} variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar sx={{ bgcolor: 'secondary.main' }}>
                  <AiIcon />
                </Avatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" fontWeight="bold">
                      {agent.name}
                    </Typography>
                    <Chip
                      label={agent.status}
                      size="small"
                      color={agent.status === 'active' ? 'success' : 'default'}
                    />
                    <Chip label={agent.provider} size="small" variant="outlined" />
                  </Stack>
                  {agent.description && (
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                      {agent.description}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    mt={1}
                    display="block"
                  >
                    Model: {agent.model} | Conversations: {agent.totalConversations} |
                    Messages: {agent.totalMessages}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
            <CardActions>
              <Button
                size="small"
                onClick={() => handleToggleStatus(agent)}
                disabled={updateAiAgent.isPending}
              >
                {agent.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
              <IconButton size="small" onClick={() => handleOpenDialog(agent)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(agent)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </CardActions>
          </Card>
        ))}
      </Stack>

      {(!aiAgentsData?.data || aiAgentsData.data.length === 0) && (
        <Alert severity="info">No AI agents configured. Create one to get started.</Alert>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAgent ? 'Edit AI Agent' : 'Create AI Agent'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={form.provider}
                label="Provider"
                onChange={(e) => setForm({ ...form, provider: e.target.value as AiProvider })}
              >
                <MenuItem value={AiProvider.CUSTOM}>Custom (External Platform)</MenuItem>
                <MenuItem value={AiProvider.OPENAI}>OpenAI</MenuItem>
                <MenuItem value={AiProvider.ANTHROPIC}>Anthropic</MenuItem>
                <MenuItem value={AiProvider.GEMINI}>Google Gemini</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Model"
              fullWidth
              required
              placeholder="e.g., gpt-4, claude-3, custom-model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
            <TextField
              label="Webhook URL"
              fullWidth
              placeholder="https://your-ai-platform.com/webhook"
              helperText="Endpoint to receive conversation context and return AI response"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
            />
            <TextField
              label="API Key"
              fullWidth
              type="password"
              placeholder={editingAgent ? '••••••••' : 'Enter API key'}
              helperText={editingAgent ? 'Leave empty to keep existing key' : 'API key for authentication'}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
            <TextField
              label="System Prompt"
              fullWidth
              multiline
              rows={4}
              placeholder="You are a helpful customer service agent..."
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={createAiAgent.isPending || updateAiAgent.isPending || !form.name || !form.model}
          >
            {createAiAgent.isPending || updateAiAgent.isPending ? (
              <CircularProgress size={20} />
            ) : editingAgent ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete AI Agent</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{agentToDelete?.name}&quot;? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deleteAiAgent.isPending}
          >
            {deleteAiAgent.isPending ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
