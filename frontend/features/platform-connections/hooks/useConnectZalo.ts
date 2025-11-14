import { useState } from 'react';
import apiClient from '@/lib/api/client';
import { ZaloAuthUrlResponse } from '../types/platform-connection.types';

export const useConnectZalo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectZalo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get OAuth URL from backend
      const response = await apiClient.get<ZaloAuthUrlResponse>(
        '/platform-connections/zalo/auth-url'
      );

      const { authUrl, codeVerifier, state } = response.data;

      // Store codeVerifier and state in localStorage for callback
      localStorage.setItem('zalo_code_verifier', codeVerifier);
      localStorage.setItem('zalo_state', state);

      // Redirect to Zalo OAuth page
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
