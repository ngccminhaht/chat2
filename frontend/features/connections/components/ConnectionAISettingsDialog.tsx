"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  SmartToy as SmartToyIcon,
  Key as KeyIcon,
  Timer as TimerIcon,
  Image as ImageIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  AccessTime as AccessTimeIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import {
  useConnectionAISettings,
  useUpdateConnectionAISettings,
} from "../hooks/useConnectionAISettings";
import { ConnectionAISettings, PlatformConnection } from "../types/platform-connection.types";

interface ConnectionAISettingsDialogProps {
  open: boolean;
  onClose: () => void;
  connection: PlatformConnection | null;
}

// Section component with icon and title
interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ icon, title, description, children }: SectionProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Box sx={{ color: "text.secondary" }}>{icon}</Box>
        <Typography variant="subtitle2" fontWeight={500}>
          {title}
        </Typography>
      </Stack>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {description}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export default function ConnectionAISettingsDialog({
  open,
  onClose,
  connection,
}: ConnectionAISettingsDialogProps) {
  const { data: config, isLoading, error } = useConnectionAISettings(connection?.id || null);
  const updateConfig = useUpdateConnectionAISettings();

  const [form, setForm] = useState<ConnectionAISettings>({
    enabled: false,
    apiKey: "",
    endpoint: "https://api.miagent.io/v1/chat-messages",
    batchDelayMs: 3000,
    maxImages: 3,
    autoUnseenTimeoutSeconds: 0,
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Sync form with fetched config
  useEffect(() => {
    if (config) {
      setForm({
        enabled: config.enabled ?? false,
        apiKey: config.apiKey ?? "",
        endpoint: config.endpoint ?? "https://api.miagent.io/v1/chat-messages",
        batchDelayMs: config.batchDelayMs ?? 3000,
        maxImages: config.maxImages ?? 3,
        autoUnseenTimeoutSeconds: config.autoUnseenTimeoutSeconds ?? 0,
      });
    }
  }, [config]);

  // Reset form when dialog opens with new connection
  useEffect(() => {
    if (open && connection?.aiSettings) {
      setForm({
        enabled: connection.aiSettings.enabled ?? false,
        apiKey: connection.aiSettings.apiKey ?? "",
        endpoint: connection.aiSettings.endpoint ?? "https://api.miagent.io/v1/chat-messages",
        batchDelayMs: connection.aiSettings.batchDelayMs ?? 3000,
        maxImages: connection.aiSettings.maxImages ?? 3,
        autoUnseenTimeoutSeconds: connection.aiSettings.autoUnseenTimeoutSeconds ?? 0,
      });
    }
  }, [open, connection]);

  const handleSave = () => {
    if (!connection) return;
    updateConfig.mutate(
      { connectionId: connection.id, settings: form },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            AI Settings - {connection?.platformAccountName}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load AI settings</Alert>
        ) : (
          <Box sx={{ pt: 1 }}>
            {/* Enable AI Agent */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2, pb: 2, borderBottom: "1px solid", borderColor: "grey.200" }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <SmartToyIcon
                  sx={{
                    color: form.enabled ? "primary.main" : "text.secondary",
                    fontSize: 28,
                  }}
                />
                <Box>
                  <Typography variant="subtitle1">AI Agent</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Bật AI để tự động trả lời tin nhắn
                  </Typography>
                </Box>
              </Stack>
              <Switch
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                color="primary"
              />
            </Stack>

            {/* API Configuration */}
            <Section
              icon={<KeyIcon fontSize="small" />}
              title="API Configuration"
            >
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="API Key"
                  type={showApiKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="app-..."
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowApiKey(!showApiKey)}
                          edge="end"
                          size="small"
                        >
                          {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="API Endpoint"
                  value={form.endpoint}
                  onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                  placeholder="https://api.miagent.io/v1/chat-messages"
                />
              </Stack>
            </Section>

            <Divider sx={{ my: 2 }} />

            {/* Timing Configuration */}
            <Section
              icon={<TimerIcon fontSize="small" />}
              title="Batch Delay"
              description="Thời gian chờ để gộp tin nhắn thành 1 batch"
            >
              <TextField
                size="small"
                type="number"
                value={form.batchDelayMs}
                onChange={(e) =>
                  setForm({ ...form, batchDelayMs: Number(e.target.value) })
                }
                InputProps={{
                  endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                  inputProps: { min: 1000, max: 30000 },
                }}
              />
            </Section>

            <Divider sx={{ my: 2 }} />

            {/* Image Configuration */}
            <Section
              icon={<ImageIcon fontSize="small" />}
              title="Max Images"
              description="Số ảnh tối đa gửi cho AI mỗi request"
            >
              <TextField
                size="small"
                type="number"
                value={form.maxImages}
                onChange={(e) =>
                  setForm({ ...form, maxImages: Number(e.target.value) })
                }
                InputProps={{
                  inputProps: { min: 1, max: 10 },
                }}
              />
            </Section>

            <Divider sx={{ my: 2 }} />

            {/* Auto-Unseen Timeout */}
            <Section
              icon={<AccessTimeIcon fontSize="small" />}
              title="Auto-Unseen Timeout"
              description="Tự động coi tin nhắn là chưa gửi đến AI nếu không xem (0 = tắt)"
            >
              <TextField
                size="small"
                type="number"
                value={form.autoUnseenTimeoutSeconds}
                onChange={(e) =>
                  setForm({ ...form, autoUnseenTimeoutSeconds: Number(e.target.value) })
                }
                InputProps={{
                  endAdornment: <InputAdornment position="end">giây</InputAdornment>,
                  inputProps: { min: 0, max: 604800 },
                }}
              />
            </Section>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={updateConfig.isPending || isLoading}
        >
          {updateConfig.isPending ? <CircularProgress size={20} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
