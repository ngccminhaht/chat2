'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import { OrganizationMembers } from '@/features/organizations';

export default function OrganizationPage() {
  return (
    <Box>
      <Stack spacing={3} maxWidth={800} mx="auto" my={2}>
        <Paper>
          <Box p={3}>
            <Stack spacing={3}>
              <Typography variant="h5">Organization Settings</Typography>

              <TextField label="Organization Name" defaultValue="My Organization" fullWidth />

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
                <TextField label="Start Time" type="time" defaultValue="08:00" fullWidth />
                <TextField label="End Time" type="time" defaultValue="18:00" fullWidth />
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
                  Save Settings
                </Button>
              </Box>
            </Stack>
          </Box>
        </Paper>

        <Paper>
          <Box p={3}>
            <OrganizationMembers />
          </Box>
        </Paper>
      </Stack>
    </Box>
  );
}
