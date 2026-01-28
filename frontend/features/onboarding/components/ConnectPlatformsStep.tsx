'use client';

import { useRouter } from 'next/navigation';
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Avatar,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Facebook as FacebookIcon,
  Chat as ZaloIcon,
  ShoppingBag as ShopeeIcon,
  Telegram as TelegramIcon,
} from '@mui/icons-material';
import { usePlatformConnections } from '@/features/connections/hooks/usePlatformConnections';
import { useConnectTelegram } from '@/features/connections/hooks/useConnectTelegram';
import TelegramConnectionDialog from '@/features/connections/components/TelegramConnectionDialog';
import { AVAILABLE_PLATFORMS } from '@/lib/constants/platforms';

// Map platform IDs to MUI icons
const platformIcons: Record<string, React.ReactNode> = {
  facebook: <FacebookIcon color="primary" />,
  zalo: <ZaloIcon color="info" />,
  shopee: <ShopeeIcon color="error" />,
  tiktok: <ShopeeIcon />,
  telegram: <TelegramIcon sx={{ color: '#0088CC' }} />,
};

export default function ConnectPlatformsStep() {
  const router = useRouter();
  const { data: connections, isLoading } = usePlatformConnections();
  const telegram = useConnectTelegram();

  const connectedPlatforms = connections?.map((c) => c.platform) || [];
  const hasConnections = connectedPlatforms.length > 0;

  const handleConnect = (platformId: string) => {
    if (platformId === 'telegram') {
      telegram.openDialog();
    } else {
      // During onboarding, connections are handled after org selection
      // For now, just show an alert - connections will be configured after org setup
      alert(`Platform connection for ${platformId} will be available after completing setup.`);
    }
  };

  const handleSkip = () => {
    router.push('/invite-members');
  };

  const handleContinue = () => {
    router.push('/invite-members');
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Connect Your Platforms
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Connect messaging platforms to start receiving messages in one place.
        </Typography>
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {AVAILABLE_PLATFORMS.map((platform) => {
            const isConnected = connectedPlatforms.includes(platform.id as any);
            return (
              <Card key={platform.id} variant="outlined">
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar>{platformIcons[platform.id]}</Avatar>
                    <Box flexGrow={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {platform.name}
                        </Typography>
                        {isConnected && (
                          <Chip label="Connected" size="small" color="success" />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {platform.description}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant={isConnected ? 'outlined' : 'contained'}
                    onClick={() => handleConnect(platform.id)}
                    disabled={isConnected}
                  >
                    {isConnected ? 'Connected' : 'Connect'}
                  </Button>
                </CardActions>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Telegram Connection Dialog */}
      <TelegramConnectionDialog
        open={telegram.isOpen}
        onClose={telegram.closeDialog}
        botToken={telegram.botToken}
        onBotTokenChange={telegram.setBotToken}
        onConnect={telegram.handleConnect}
        isLoading={telegram.isLoading}
        error={telegram.error}
      />

      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button variant="text" onClick={handleSkip}>
          Skip for now
        </Button>
        <Button
          variant="contained"
          onClick={handleContinue}
          disabled={!hasConnections && !isLoading}
        >
          {hasConnections ? 'Continue' : 'Skip & Continue'}
        </Button>
      </Stack>
    </Stack>
  );
}
