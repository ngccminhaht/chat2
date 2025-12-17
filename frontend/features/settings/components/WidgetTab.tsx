'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  FormControlLabel,
  Switch,
  Chip,
  Paper,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useWidgetConfig, useUpdateWidgetConfig, UpdateWidgetConfigDto } from '../hooks/useWidgetConfig';

const PRE_CHAT_FIELD_OPTIONS = ['name', 'email', 'phone', 'company', 'message'];

export default function WidgetTab() {
  const { data: config, isLoading, error } = useWidgetConfig();
  const updateConfig = useUpdateWidgetConfig();

  const [form, setForm] = useState<UpdateWidgetConfigDto>({});
  const [copied, setCopied] = useState(false);

  // Sync form with fetched config
  useEffect(() => {
    if (config) {
      setForm({
        primaryColor: config.primaryColor,
        position: config.position,
        greeting: config.greeting,
        logo: config.logo,
        offlineMessage: config.offlineMessage,
        preChatForm: config.preChatForm,
        preChatFields: config.preChatFields,
      });
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(form);
  };

  const handleFieldToggle = (field: string) => {
    const currentFields = form.preChatFields || [];
    if (currentFields.includes(field)) {
      setForm({ ...form, preChatFields: currentFields.filter((f) => f !== field) });
    } else {
      setForm({ ...form, preChatFields: [...currentFields, field] });
    }
  };

  const embedCode = config
    ? `<script src="${window.location.origin}/widget.js" data-org="${config.organizationSlug}"></script>`
    : '';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load widget configuration</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Chat Widget</Typography>

      <Alert severity="info">
        Configure your embeddable chat widget. Add the code snippet to your website to enable live
        chat.
      </Alert>

      {/* Embed Code */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Embed Code
        </Typography>
        <Box
          sx={{
            bgcolor: 'grey.100',
            p: 2,
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: 12,
            wordBreak: 'break-all',
          }}
        >
          {embedCode}
        </Box>
        <Button
          size="small"
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={handleCopyCode}
          sx={{ mt: 1 }}
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </Button>
      </Paper>

      <Divider />

      {/* Appearance */}
      <Typography variant="subtitle1">Appearance</Typography>

      <Stack direction="row" spacing={2}>
        <TextField
          label="Primary Color"
          type="color"
          value={form.primaryColor || '#0066FF'}
          onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
          sx={{ width: 120 }}
        />

        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>Position</InputLabel>
          <Select
            value={form.position || 'right'}
            label="Position"
            onChange={(e) => setForm({ ...form, position: e.target.value as 'left' | 'right' })}
          >
            <MenuItem value="left">Left</MenuItem>
            <MenuItem value="right">Right</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <TextField
        label="Logo URL"
        fullWidth
        placeholder="https://example.com/logo.png"
        value={form.logo || ''}
        onChange={(e) => setForm({ ...form, logo: e.target.value })}
        helperText="Optional. URL to your company logo"
      />

      <Divider />

      {/* Messages */}
      <Typography variant="subtitle1">Messages</Typography>

      <TextField
        label="Greeting Message"
        fullWidth
        multiline
        rows={2}
        value={form.greeting || ''}
        onChange={(e) => setForm({ ...form, greeting: e.target.value })}
        helperText="First message shown to visitors"
      />

      <TextField
        label="Offline Message"
        fullWidth
        multiline
        rows={2}
        value={form.offlineMessage || ''}
        onChange={(e) => setForm({ ...form, offlineMessage: e.target.value })}
        helperText="Shown when no agents are online"
      />

      <Divider />

      {/* Pre-Chat Form */}
      <Typography variant="subtitle1">Pre-Chat Form</Typography>

      <FormControlLabel
        control={
          <Switch
            checked={form.preChatForm || false}
            onChange={(e) => setForm({ ...form, preChatForm: e.target.checked })}
          />
        }
        label="Require visitor info before starting chat"
      />

      {form.preChatForm && (
        <Box>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Required Fields
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
            {PRE_CHAT_FIELD_OPTIONS.map((field) => (
              <Chip
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                onClick={() => handleFieldToggle(field)}
                color={form.preChatFields?.includes(field) ? 'primary' : 'default'}
                variant={form.preChatFields?.includes(field) ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={updateConfig.isPending}
        >
          {updateConfig.isPending ? <CircularProgress size={20} /> : 'Save Widget Settings'}
        </Button>
      </Box>

      {updateConfig.isSuccess && (
        <Alert severity="success">Widget settings saved successfully!</Alert>
      )}
    </Stack>
  );
}
