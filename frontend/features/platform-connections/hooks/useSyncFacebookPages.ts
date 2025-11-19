import { useState } from 'react';
import apiClient from '@/lib/api/client';

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

  const syncPages = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Call backend to generate OAuth URL with sync mode flag
      const response = await apiClient.get<SyncAuthUrlResponse>(
        '/platform-connections/facebook/sync-auth-url'
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
        '/platform-connections/facebook/sync-status'
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
