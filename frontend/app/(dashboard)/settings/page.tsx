'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Stack,
  TextField,
  Button,
  Avatar,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
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
} from '@mui/material';
import {
  Person as PersonIcon,
  Notifications as NotificationsIcon,
  Group as TeamIcon,
  Business as OrgIcon,
  SmartToy as AiIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useAgents } from '@/features/conversations/hooks/useAgents';
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const defaultAiAgentForm: CreateAiAgentDto = {
  name: '',
  description: '',
  provider: AiProvider.CUSTOM,
  model: '',
  systemPrompt: '',
  webhookUrl: '',
  apiKey: '',
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const user = useAuthStore((state) => state.user);
  const { data: agentsData, isLoading: isLoadingAgents } = useAgents();

  // AI Agents
  const { data: aiAgentsData, isLoading: isLoadingAiAgents } = useAiAgents();
  const createAiAgent = useCreateAiAgent();
  const updateAiAgent = useUpdateAiAgent();
  const deleteAiAgent = useDeleteAiAgent();

  // AI Agent dialog state
  const [aiAgentDialogOpen, setAiAgentDialogOpen] = useState(false);
  const [editingAiAgent, setEditingAiAgent] = useState<AiAgent | null>(null);
  const [aiAgentForm, setAiAgentForm] = useState<CreateAiAgentDto>(defaultAiAgentForm);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AiAgent | null>(null);

  // Notification settings state
  const [notifications, setNotifications] = useState({
    newMessage: true,
    newConversation: true,
    assignedToMe: true,
    sound: true,
    desktop: false,
  });

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // AI Agent handlers
  const handleOpenAiAgentDialog = (agent?: AiAgent) => {
    if (agent) {
      setEditingAiAgent(agent);
      setAiAgentForm({
        name: agent.name,
        description: agent.description || '',
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt || '',
        webhookUrl: agent.webhookUrl || '',
        apiKey: '', // Don't show existing API key
      });
    } else {
      setEditingAiAgent(null);
      setAiAgentForm(defaultAiAgentForm);
    }
    setAiAgentDialogOpen(true);
  };

  const handleCloseAiAgentDialog = () => {
    setAiAgentDialogOpen(false);
    setEditingAiAgent(null);
    setAiAgentForm(defaultAiAgentForm);
  };

  const handleSaveAiAgent = () => {
    if (editingAiAgent) {
      updateAiAgent.mutate(
        { id: editingAiAgent._id, dto: aiAgentForm },
        { onSuccess: handleCloseAiAgentDialog }
      );
    } else {
      createAiAgent.mutate(aiAgentForm, { onSuccess: handleCloseAiAgentDialog });
    }
  };

  const handleDeleteAiAgent = (agent: AiAgent) => {
    setAgentToDelete(agent);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteAiAgent = () => {
    if (agentToDelete) {
      deleteAiAgent.mutate(agentToDelete._id, {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setAgentToDelete(null);
        },
      });
    }
  };

  const handleToggleAiAgentStatus = (agent: AiAgent) => {
    const newStatus = agent.status === AiAgentStatus.ACTIVE ? AiAgentStatus.INACTIVE : AiAgentStatus.ACTIVE;
    updateAiAgent.mutate({ id: agent._id, dto: { status: newStatus } });
  };

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab icon={<PersonIcon />} label="Profile" iconPosition="start" />
            <Tab icon={<NotificationsIcon />} label="Notifications" iconPosition="start" />
            <Tab icon={<TeamIcon />} label="Team" iconPosition="start" />
            <Tab icon={<AiIcon />} label="AI Agents" iconPosition="start" />
            <Tab icon={<OrgIcon />} label="Organization" iconPosition="start" />
          </Tabs>
        </Box>

        {/* Profile Tab */}
        <TabPanel value={activeTab} index={0}>
          <Stack spacing={3}>
            <Typography variant="h6">Profile Settings</Typography>

            <Stack direction="row" spacing={3} alignItems="center">
              <Avatar sx={{ width: 80, height: 80 }} src={user?.avatar}>
                {user?.name?.charAt(0) || 'U'}
              </Avatar>
              <Box>
                <Button variant="outlined" size="small">
                  Change Avatar
                </Button>
              </Box>
            </Stack>

            <TextField
              label="Full Name"
              defaultValue={user?.name || ''}
              fullWidth
            />

            <TextField
              label="Email"
              defaultValue={user?.email || ''}
              fullWidth
              disabled
              helperText="Email cannot be changed"
            />

            <TextField
              label="Role"
              value={user?.role || 'agent'}
              fullWidth
              disabled
            />

            <Divider />

            <Typography variant="subtitle1">Change Password</Typography>

            <TextField
              label="Current Password"
              type="password"
              fullWidth
            />

            <TextField
              label="New Password"
              type="password"
              fullWidth
            />

            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
            />

            <Box>
              <Button variant="contained" color="primary">
                Save Changes
              </Button>
            </Box>
          </Stack>
        </TabPanel>

        {/* Notifications Tab */}
        <TabPanel value={activeTab} index={1}>
          <Stack spacing={3}>
            <Typography variant="h6">Notification Preferences</Typography>

            <Alert severity="info">
              Configure how you receive notifications for new messages and conversations.
            </Alert>

            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Email Notifications
              </Typography>
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifications.newMessage}
                      onChange={() => handleNotificationChange('newMessage')}
                    />
                  }
                  label="New messages"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifications.newConversation}
                      onChange={() => handleNotificationChange('newConversation')}
                    />
                  }
                  label="New conversations"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifications.assignedToMe}
                      onChange={() => handleNotificationChange('assignedToMe')}
                    />
                  }
                  label="Assigned to me"
                />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle1" gutterBottom>
                In-App Notifications
              </Typography>
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifications.sound}
                      onChange={() => handleNotificationChange('sound')}
                    />
                  }
                  label="Sound alerts"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifications.desktop}
                      onChange={() => handleNotificationChange('desktop')}
                    />
                  }
                  label="Desktop notifications"
                />
              </Stack>
            </Box>

            <Box>
              <Button variant="contained" color="primary">
                Save Preferences
              </Button>
            </Box>
          </Stack>
        </TabPanel>

        {/* Team Tab */}
        <TabPanel value={activeTab} index={2}>
          <Stack spacing={3}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Team Members</Typography>
              <Button variant="contained" size="small">
                Invite Member
              </Button>
            </Stack>

            {isLoadingAgents ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : (
              <List>
                {agentsData?.data.map((agent) => (
                  <ListItem key={agent._id} divider>
                    <ListItemAvatar>
                      <Avatar src={agent.avatar}>{agent.name?.charAt(0)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={agent.name}
                      secondary={agent.email}
                    />
                    <ListItemSecondaryAction>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={agent.role}
                          size="small"
                          color={agent.role === 'admin' ? 'primary' : 'default'}
                        />
                        <Chip
                          label={agent.isActive ? 'Active' : 'Inactive'}
                          size="small"
                          color={agent.isActive ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </Stack>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}

            {!isLoadingAgents && (!agentsData?.data || agentsData.data.length === 0) && (
              <Alert severity="info">No team members found.</Alert>
            )}
          </Stack>
        </TabPanel>

        {/* AI Agents Tab */}
        <TabPanel value={activeTab} index={3}>
          <Stack spacing={3}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">AI Agents</Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => handleOpenAiAgentDialog()}
              >
                Add AI Agent
              </Button>
            </Stack>

            <Alert severity="info">
              AI Agents can automatically respond to customers when assigned to conversations.
              Configure webhook URL to connect to your external AI platform.
            </Alert>

            {isLoadingAiAgents ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : (
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
                            <Chip
                              label={agent.provider}
                              size="small"
                              variant="outlined"
                            />
                          </Stack>
                          {agent.description && (
                            <Typography variant="body2" color="text.secondary" mt={0.5}>
                              {agent.description}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" mt={1} display="block">
                            Model: {agent.model} | Conversations: {agent.totalConversations} | Messages: {agent.totalMessages}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                    <CardActions>
                      <Button
                        size="small"
                        onClick={() => handleToggleAiAgentStatus(agent)}
                        disabled={updateAiAgent.isPending}
                      >
                        {agent.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <IconButton size="small" onClick={() => handleOpenAiAgentDialog(agent)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteAiAgent(agent)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </CardActions>
                  </Card>
                ))}
              </Stack>
            )}

            {!isLoadingAiAgents && (!aiAgentsData?.data || aiAgentsData.data.length === 0) && (
              <Alert severity="info">No AI agents configured. Create one to get started.</Alert>
            )}
          </Stack>
        </TabPanel>

        {/* Organization Tab */}
        <TabPanel value={activeTab} index={4}>
          <Stack spacing={3}>
            <Typography variant="h6">Organization Settings</Typography>

            <TextField
              label="Organization Name"
              defaultValue="My Organization"
              fullWidth
            />

            <TextField
              label="Timezone"
              defaultValue="Asia/Ho_Chi_Minh"
              fullWidth
              select
              SelectProps={{ native: true }}
            >
              <option value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh (UTC+7)</option>
              <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
              <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
              <option value="UTC">UTC</option>
            </TextField>

            <Divider />

            <Typography variant="subtitle1">Working Hours</Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Time"
                type="time"
                defaultValue="08:00"
                sx={{ width: 150 }}
              />
              <TextField
                label="End Time"
                type="time"
                defaultValue="18:00"
                sx={{ width: 150 }}
              />
            </Stack>

            <FormControlLabel
              control={<Switch defaultChecked />}
              label="Enable auto-reply outside working hours"
            />

            <TextField
              label="Auto-reply Message"
              multiline
              rows={3}
              defaultValue="Thank you for contacting us. We will respond during our working hours (8:00 AM - 6:00 PM)."
              fullWidth
            />

            <Box>
              <Button variant="contained" color="primary">
                Save Organization Settings
              </Button>
            </Box>
          </Stack>
        </TabPanel>
      </Paper>

      {/* AI Agent Create/Edit Dialog */}
      <Dialog open={aiAgentDialogOpen} onClose={handleCloseAiAgentDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAiAgent ? 'Edit AI Agent' : 'Create AI Agent'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              required
              value={aiAgentForm.name}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, name: e.target.value })}
            />

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={aiAgentForm.description}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, description: e.target.value })}
            />

            <FormControl fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={aiAgentForm.provider}
                label="Provider"
                onChange={(e) => setAiAgentForm({ ...aiAgentForm, provider: e.target.value as AiProvider })}
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
              value={aiAgentForm.model}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, model: e.target.value })}
            />

            <TextField
              label="Webhook URL"
              fullWidth
              placeholder="https://your-ai-platform.com/webhook"
              helperText="Endpoint to receive conversation context and return AI response"
              value={aiAgentForm.webhookUrl}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, webhookUrl: e.target.value })}
            />

            <TextField
              label="API Key"
              fullWidth
              type="password"
              placeholder={editingAiAgent ? '••••••••' : 'Enter API key'}
              helperText={editingAiAgent ? 'Leave empty to keep existing key' : 'API key for authentication'}
              value={aiAgentForm.apiKey}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, apiKey: e.target.value })}
            />

            <TextField
              label="System Prompt"
              fullWidth
              multiline
              rows={4}
              placeholder="You are a helpful customer service agent..."
              value={aiAgentForm.systemPrompt}
              onChange={(e) => setAiAgentForm({ ...aiAgentForm, systemPrompt: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAiAgentDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveAiAgent}
            disabled={createAiAgent.isPending || updateAiAgent.isPending || !aiAgentForm.name || !aiAgentForm.model}
          >
            {createAiAgent.isPending || updateAiAgent.isPending ? (
              <CircularProgress size={20} />
            ) : editingAiAgent ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete AI Agent</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{agentToDelete?.name}&quot;? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDeleteAiAgent}
            disabled={deleteAiAgent.isPending}
          >
            {deleteAiAgent.isPending ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
