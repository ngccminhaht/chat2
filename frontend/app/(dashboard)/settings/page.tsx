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
} from '@mui/material';
import {
  Person as PersonIcon,
  Notifications as NotificationsIcon,
  Group as TeamIcon,
  Business as OrgIcon,
} from '@mui/icons-material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { useAgents } from '@/features/conversations/hooks/useAgents';

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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const user = useAuthStore((state) => state.user);
  const { data: agentsData, isLoading: isLoadingAgents } = useAgents();

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

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab icon={<PersonIcon />} label="Profile" iconPosition="start" />
            <Tab icon={<NotificationsIcon />} label="Notifications" iconPosition="start" />
            <Tab icon={<TeamIcon />} label="Team" iconPosition="start" />
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

        {/* Organization Tab */}
        <TabPanel value={activeTab} index={3}>
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
    </Box>
  );
}
