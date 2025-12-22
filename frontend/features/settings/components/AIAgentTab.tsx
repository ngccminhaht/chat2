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
  Paper,
  Divider,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  SmartToy as SmartToyIcon,
  Key as KeyIcon,
  Timer as TimerIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  useAIAgentConfig,
  useUpdateAIAgentConfig,
  UpdateAIAgentDto,
} from "../hooks/useAIAgentConfig";

// Section component with icon and title
interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ icon, title, description, children }: SectionProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ color: "text.secondary" }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={500}>
          {title}
        </Typography>
      </Stack>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export default function AIAgentTab() {
  const { data: config, isLoading, error } = useAIAgentConfig();
  const updateConfig = useUpdateAIAgentConfig();

  const [form, setForm] = useState<UpdateAIAgentDto>({
    enabled: false,
    apiKey: "",
    endpoint: "https://api.miagent.io/v1/chat-messages",
    batchDelayMs: 3000,
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
      });
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(form);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Failed to load AI agent configuration</Alert>
    );
  }

  return (
    <Box>
      <Paper variant="outlined" sx={{ maxWidth: 800, p: 3 }}>
        {/* Enable AI Agent */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            mb: 3,
            pb: 3,
            borderBottom: "1px solid",
            borderColor: "grey.200",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <SmartToyIcon
              sx={{
                color: form.enabled ? "primary.main" : "text.secondary",
                fontSize: 32,
              }}
            />
            <Box>
              <Typography variant="h6">AI Agent</Typography>
              <Typography variant="body2" color="text.secondary">
                Bật AI Agent để tự động trả lời tin nhắn từ khách hàng
              </Typography>
            </Box>
          </Stack>
          <Switch
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            color="primary"
            size="medium"
          />
        </Stack>

        {/* API Configuration */}
        <Section
          icon={<KeyIcon />}
          title="API Configuration"
          description="Cấu hình kết nối với MiAgent AI service"
        >
          <Stack spacing={3}>
            {/* API Key */}
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
              helperText="API key từ MiAgent"
            />

            {/* Endpoint */}
            <TextField
              fullWidth
              size="small"
              label="API Endpoint"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="https://api.miagent.io/v1/chat-messages"
              helperText="URL endpoint của AI service"
            />
          </Stack>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Timing Configuration */}
        <Section
          icon={<TimerIcon />}
          title="Timing Configuration"
          description="Cấu hình thời gian đợi trước khi AI phản hồi"
        >
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Thời gian chờ trước khi AI trả lời
            </Typography>
            <TextField
              size="small"
              type="number"
              value={form.batchDelayMs}
              onChange={(e) =>
                setForm({ ...form, batchDelayMs: Number(e.target.value) })
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">ms</InputAdornment>
                ),
              }}
              helperText="Thời gian chờ để gộp nhiều tin nhắn thành 1 batch (1000-30000ms)"
            />
          </Box>
        </Section>

        {/* Save Button */}
        <Divider sx={{ my: 3 }} />
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={updateConfig.isPending}
          >
            {updateConfig.isPending ? (
              <CircularProgress size={20} />
            ) : (
              "Lưu cài đặt"
            )}
          </Button>
          {updateConfig.isSuccess && (
            <Alert severity="success" sx={{ py: 0 }}>
              Đã lưu!
            </Alert>
          )}
          {updateConfig.isError && (
            <Alert severity="error" sx={{ py: 0 }}>
              Lỗi khi lưu!
            </Alert>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
