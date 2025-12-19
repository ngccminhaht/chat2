import { useState } from 'react';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface SyncStatusResponse {
  success: boolean;
  connectedPages: number;
  lastSyncAt: string | null;
}

interface SyncAuthUrlResponse {
  authUrl: string;
  state: string;
}

export const useSyncFacebookPages = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const organizationId = useAuthStore((state) => state.organization?.id);

  const syncPages = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get<SyncAuthUrlResponse>(
        `/organizations/${organizationId}/connections/facebook/sync-auth-url`
      );

      const { authUrl } = response.data;

      // Redirect to Facebook OAuth page
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to sync Facebook pages');
      setIsLoading(false);
    }
  };

  const getSyncStatus = async () => {
    try {
      const response = await apiClient.get<SyncStatusResponse>(
        `/organizations/${organizationId}/connections/facebook/sync-status`
      );
      setSyncStatus(response.data);
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to get sync status');
      throw err;
    }
  };

  return {
    syncPages,
    getSyncStatus,
    syncStatus,
    isLoading,
    error,
  };
};
