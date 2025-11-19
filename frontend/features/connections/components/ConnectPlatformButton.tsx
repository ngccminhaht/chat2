'use client';

import { Button, CircularProgress } from '@mui/material';
import { useConnectZalo } from '../hooks/useConnectZalo';
import { useConnectShopee } from '../hooks/useConnectShopee';
import { useConnectFacebook } from '../hooks/useConnectFacebook';

interface ConnectPlatformButtonProps {
  platform: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
}

const platformInfo = {
  facebook: {
    name: 'Facebook Page',
    description: 'Connect your Facebook Page to manage messages',
  },
  zalo: {
    name: 'Zalo OA',
    description: 'Connect your Zalo Official Account',
  },
  tiktok: {
    name: 'TikTok Shop',
    description: 'Connect your TikTok Shop account',
  },
  shopee: {
    name: 'Shopee',
    description: 'Connect your Shopee store',
  },
};

export default function ConnectPlatformButton({
  platform,
}: ConnectPlatformButtonProps) {
  const { connectZalo, isLoading: isLoadingZalo, error: errorZalo } = useConnectZalo();
  const { connectShopee, isLoading: isLoadingShopee, error: errorShopee } = useConnectShopee();
  const { connectFacebook, isLoading: isLoadingFacebook, error: errorFacebook } = useConnectFacebook();

  const info = platformInfo[platform];

  // Get platform-specific loading state and error
  let isLoading = false;
  let error: string | null = null;

  if (platform === 'facebook') {
    isLoading = isLoadingFacebook;
    error = errorFacebook;
  } else if (platform === 'zalo') {
    isLoading = isLoadingZalo;
    error = errorZalo;
  } else if (platform === 'shopee') {
    isLoading = isLoadingShopee;
    error = errorShopee;
  }

  const handleConnect = () => {
    if (platform === 'facebook') {
      connectFacebook();
    } else if (platform === 'zalo') {
      connectZalo();
    } else if (platform === 'shopee') {
      connectShopee();
    } else if (platform === 'tiktok') {
      alert(`${info.name} connection coming soon!`);
    }
  };

  return (
    <Button
      variant="contained"
      color="primary"
      size="large"
      onClick={handleConnect}
      disabled={isLoading || platform === 'tiktok'}
      startIcon={isLoading && <CircularProgress size={20} color="inherit" />}
    >
      {isLoading ? 'Connecting...' : platform === 'tiktok' ? 'Coming Soon' : `Connect ${info.name}`}
    </Button>
  );
}
