'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { useApiKey, useGenerateApiKey, useRevokeApiKey } from '../hooks/useApiKey';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function ApiKeySection() {
  const organizationId = useAuthStore((state) => state.organizationId);
  const { data, isLoading } = useApiKey(organizationId || undefined);
  const generateApiKey = useGenerateApiKey(organizationId || undefined);
  const revokeApiKey = useRevokeApiKey(organizationId || undefined);

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'regenerate' | 'revoke'>('regenerate');

  const handleCopy = async () => {
    if (data?.apiKey) {
      await navigator.clipboard.writeText(data.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAction = (action: 'regenerate' | 'revoke') => {
    setDialogAction(action);
    setConfirmDialogOpen(true);
  };

  const confirmAction = async () => {
    if (dialogAction === 'regenerate') {
      await generateApiKey.mutateAsync();
    } else {
      await revokeApiKey.mutateAsync();
    }
    setConfirmDialogOpen(false);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">API Key</Typography>
      <Typography variant="body2" color="text.secondary">
        Use this API key to authenticate webhook requests to your organization.
      </Typography>

      {generateApiKey.isError && (
        <Alert severity="error">Failed to generate API key</Alert>
      )}
      {revokeApiKey.isError && (
        <Alert severity="error">Failed to revoke API key</Alert>
      )}

      {data?.apiKey ? (
        <Stack spacing={2}>
          <TextField
            fullWidth
            value={showKey ? data.apiKey : data.masked}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowKey(!showKey)} edge="end">
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                  <IconButton onClick={handleCopy} edge="end">
                    <CopyIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {copied && (
            <Alert severity="success">Copied to clipboard!</Alert>
          )}
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => handleAction('regenerate')}
              disabled={generateApiKey.isPending}
            >
              Regenerate
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => handleAction('revoke')}
              disabled={revokeApiKey.isPending}
            >
              Revoke
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Box>
          <Button
            variant="contained"
            onClick={() => generateApiKey.mutate()}
            disabled={generateApiKey.isPending}
          >
            {generateApiKey.isPending ? (
              <CircularProgress size={20} />
            ) : (
              'Generate API Key'
            )}
          </Button>
        </Box>
      )}

      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>
          {dialogAction === 'regenerate' ? 'Regenerate API Key?' : 'Revoke API Key?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dialogAction === 'regenerate'
              ? 'This will invalidate the current API key. Any integrations using the old key will stop working.'
              : 'This will permanently delete your API key. Any integrations using this key will stop working.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={dialogAction === 'revoke' ? 'error' : 'primary'}
            onClick={confirmAction}
            disabled={generateApiKey.isPending || revokeApiKey.isPending}
          >
            {generateApiKey.isPending || revokeApiKey.isPending ? (
              <CircularProgress size={20} />
            ) : dialogAction === 'regenerate' ? (
              'Regenerate'
            ) : (
              'Revoke'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
