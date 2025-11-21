import { useState } from 'react';
import apiClient from '@/lib/api/client';

interface ShopeeAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useConnectShopee = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectShopee = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Call backend to generate OAuth URL and store state in Redis
      const response = await apiClient.get<ShopeeAuthUrlResponse>(
        '/shopee/auth-url'
      );

      const { authUrl } = response.data;

      // Redirect to Shopee OAuth page
      // State is already stored in Redis on backend
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to connect Shopee');
      setIsLoading(false);
    }
  };

  return {
    connectShopee,
    isLoading,
    error,
  };
};
