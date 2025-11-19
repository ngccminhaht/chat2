import { useState } from 'react';
import apiClient from '@/lib/api/client';

interface SyncStatusResponse {
  success: boolean;
  connectedPages: number;
  lastSyncAt: string | null;
}

export const useSyncFacebookPages = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);

  const syncPages = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Redirect to sync endpoint (will redirect to Facebook OAuth)
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/platform-connections/facebook/sync-pages`;
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
