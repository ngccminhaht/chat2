import { useState } from 'react';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface FacebookAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useConnectFacebook = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const organization = useAuthStore((state) => state.organization);

  const connectFacebook = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!organization?.id) {
        throw new Error('Organization not selected');
      }

      // Call backend to generate OAuth URL and store state in Redis
      const response = await apiClient.get<FacebookAuthUrlResponse>(
        '/facebook/auth-url',
        { params: { organizationId: organization.id } }
      );

      const { authUrl } = response.data;

      // Redirect to Facebook OAuth page
      // State is already stored in Redis on backend
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to connect Facebook');
      setIsLoading(false);
    }
  };

  return {
    connectFacebook,
    isLoading,
    error,
  };
};
