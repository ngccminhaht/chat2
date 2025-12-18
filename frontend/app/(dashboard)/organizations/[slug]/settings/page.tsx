'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function SettingsPage() {
  const organization = useAuthStore((state) => state.organization);
  const currentRole = useAuthStore((state) => state.getCurrentRole());
  const isOwner = currentRole === 'owner';

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <Stack spacing={3}>
          <Typography variant="h5">Organization Settings</Typography>

          {!isOwner && (
            <Alert severity="info">
              Only organization owners can modify these settings.
            </Alert>
          )}

          <Stack spacing={2}>
            <TextField
              label="Organization Name"
              defaultValue={organization?.name || ''}
              fullWidth
              disabled={!isOwner}
            />

            <TextField
              label="URL Slug"
              defaultValue={organization?.slug || ''}
              fullWidth
              disabled
              helperText="URL slug cannot be changed"
            />

            <TextField
              label="Plan"
              value={organization?.plan || 'free'}
              fullWidth
              disabled
              helperText="Contact support to upgrade your plan"
            />
          </Stack>

          {isOwner && (
            <>
              <Box>
                <Button variant="contained" disabled>
                  Save Changes
                </Button>
              </Box>

              <Divider />

              <Stack spacing={2}>
                <Typography variant="h6" color="error">
                  Danger Zone
                </Typography>
                <Alert severity="warning">
                  Deleting an organization will remove all data including conversations,
                  messages, connections, and team members. This action cannot be undone.
                </Alert>
                <Box>
                  <Button variant="outlined" color="error" disabled>
                    Delete Organization
                  </Button>
                </Box>
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
