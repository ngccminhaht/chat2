import { useState } from 'react';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface ZaloAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useConnectZalo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const organization = useAuthStore((state) => state.organization);

  const connectZalo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!organization?.id) {
        throw new Error('Organization not selected');
      }

      // Call backend to generate OAuth URL and store state in Redis
      const response = await apiClient.get<ZaloAuthUrlResponse>(
        '/zalo/auth-url',
        { params: { organizationId: organization.id } }
      );

      const { authUrl } = response.data;

      // Redirect to Zalo OAuth page
      // State is already stored in Redis on backend
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to connect Zalo');
      setIsLoading(false);
    }
  };

  return {
    connectZalo,
    isLoading,
    error,
  };
};
