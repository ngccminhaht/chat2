'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  Link,
  CircularProgress,
} from '@mui/material';

interface TelegramConnectionDialogProps {
  open: boolean;
  onClose: () => void;
  botToken: string;
  onBotTokenChange: (value: string) => void;
  onConnect: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function TelegramConnectionDialog({
  open,
  onClose,
  botToken,
  onBotTokenChange,
  onConnect,
  isLoading,
  error,
}: TelegramConnectionDialogProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Connect Telegram Bot</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              To connect your Telegram bot, you need to provide the bot token from BotFather.
            </Typography>

            <Alert severity="info">
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                How to get your bot token:
              </Typography>
              <Typography variant="body2" component="div">
                1. Open Telegram and search for{' '}
                <Link
                  href="https://t.me/botfather"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @BotFather
                </Link>
                <br />
                2. Send <code>/newbot</code> to create a new bot or <code>/mybots</code> to manage
                existing bots
                <br />
                3. Copy the bot token (format: 123456:ABC-DEF1234...)
              </Typography>
            </Alert>

            <TextField
              label="Bot Token"
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              value={botToken}
              onChange={(e) => onBotTokenChange(e.target.value)}
              fullWidth
              required
              disabled={isLoading}
              helperText="Paste your bot token from @BotFather"
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading || !botToken.trim()}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Connect'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
