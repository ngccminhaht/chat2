'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Avatar,
  Chip,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import { useAgents } from '@/features/conversations/hooks/useAgents';

export default function TeamPage() {
  const { data: agentsData, isLoading } = useAgents();

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 800, mx: 'auto', my: 2, p: 3 }}>
        <Stack spacing={3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">Team Members</Typography>
            <Button variant="contained" size="small">
              Invite Member
            </Button>
          </Stack>

          {isLoading ? (
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
                  <ListItemText primary={agent.name} secondary={agent.email} />
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

          {!isLoading && (!agentsData?.data || agentsData.data.length === 0) && (
            <Alert severity="info">No team members found.</Alert>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
