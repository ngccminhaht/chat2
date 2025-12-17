'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Avatar,
  Divider,
} from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Profile Settings</Typography>

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

        <TextField label="Full Name" defaultValue={user?.name || ''} fullWidth />

        <TextField
          label="Email"
          defaultValue={user?.email || ''}
          fullWidth
          disabled
          helperText="Email cannot be changed"
        />

        <TextField label="Role" value={user?.role || 'agent'} fullWidth disabled />

        <Divider />

        <Typography variant="subtitle1">Change Password</Typography>

        <TextField label="Current Password" type="password" fullWidth />

        <TextField label="New Password" type="password" fullWidth />

        <TextField label="Confirm New Password" type="password" fullWidth />

        <Box>
          <Button variant="contained" color="primary">
            Save Changes
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
