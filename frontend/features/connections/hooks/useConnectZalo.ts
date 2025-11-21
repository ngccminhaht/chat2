import { useState } from 'react';
import apiClient from '@/lib/api/client';

interface ZaloAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useConnectZalo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectZalo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Call backend to generate OAuth URL and store state in Redis
      const response = await apiClient.get<ZaloAuthUrlResponse>(
        '/zalo/auth-url'
      );

      const { authUrl } = response.data;

      // Redirect to Zalo OAuth page
      // State is already stored in Redis on backend
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to connect Zalo');
      setIsLoading(false);
    }
  };

  return {
    connectZalo,
    isLoading,
    error,
  };
};
