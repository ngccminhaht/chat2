'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
} from '@mui/material';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState({
    newMessage: true,
    newConversation: true,
    assignedToMe: true,
    sound: true,
    desktop: false,
  });

  const handleChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 600, mx: 'auto', my: 2, p: 3 }}>
        <Stack spacing={3}>
          <Typography variant="h5">Notification Preferences</Typography>

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
                    onChange={() => handleChange('newMessage')}
                  />
                }
                label="New messages"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.newConversation}
                    onChange={() => handleChange('newConversation')}
                  />
                }
                label="New conversations"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.assignedToMe}
                    onChange={() => handleChange('assignedToMe')}
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
                  <Switch checked={notifications.sound} onChange={() => handleChange('sound')} />
                }
                label="Sound alerts"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.desktop}
                    onChange={() => handleChange('desktop')}
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
      </Paper>
    </Box>
  );
}
