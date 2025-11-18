'use client';

import { Button, Box, Typography } from '@mui/material';
import { useConnectZalo } from '../hooks/useConnectZalo';
import { useConnectShopee } from '../hooks/useConnectShopee';

interface ConnectPlatformButtonProps {
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
}

const platformInfo = {
  facebook: {
    name: 'Facebook Page',
    color: '#1877F2',
    icon: 'F',
  },
  zalo: {
    name: 'Zalo OA',
    color: '#0068FF',
    icon: 'Z',
  },
  tiktok: {
    name: 'TikTok Shop',
    color: '#000000',
    icon: 'T',
  },
  shopee: {
    name: 'Shopee',
    color: '#EE4D2D',
    icon: 'S',
  },
};

export default function ConnectPlatformButton({
  platform,
}: ConnectPlatformButtonProps) {
  const { connectZalo, isLoading: isLoadingZalo, error: errorZalo } = useConnectZalo();
  const { connectShopee, isLoading: isLoadingShopee, error: errorShopee } = useConnectShopee();

  const info = platformInfo[platform];

  const isLoading = isLoadingZalo || isLoadingShopee;
  const error = errorZalo || errorShopee;

  const handleConnect = () => {
    if (platform === 'zalo') {
      connectZalo();
    } else if (platform === 'shopee') {
      connectShopee();
    } else {
      // TODO: Implement other platforms
      alert(`${info.name} connection coming soon!`);
    }
  };

  return (
    <Box>
      <Button
        variant="contained"
        fullWidth
        onClick={handleConnect}
        disabled={isLoading}
        sx={{
          bgcolor: info.color,
          '&:hover': {
            bgcolor: info.color,
            opacity: 0.9,
          },
          py: 2,
        }}
      >
        <Box textAlign="center">
          <Typography variant="h6">Connect {info.name}</Typography>
          {isLoading && (
            <Typography variant="caption">Redirecting...</Typography>
          )}
        </Box>
      </Button>
      {error && (
        <Typography variant="caption" color="error" mt={1}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
