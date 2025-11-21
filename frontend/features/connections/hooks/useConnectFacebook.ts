import { useState } from 'react';
import apiClient from '@/lib/api/client';

interface FacebookAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useConnectFacebook = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectFacebook = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Call backend to generate OAuth URL and store state in Redis
      const response = await apiClient.get<FacebookAuthUrlResponse>(
        '/facebook/auth-url'
      );

      const { authUrl } = response.data;

      // Redirect to Facebook OAuth page
      // State is already stored in Redis on backend
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to connect Facebook');
      setIsLoading(false);
    }
  };

  return {
    connectFacebook,
    isLoading,
    error,
  };
};
