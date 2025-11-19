/**
 * Generic Platform Connection Hook
 * Replaces platform-specific hooks (useConnectFacebook, useConnectZalo, etc.)
 */

import { useState } from 'react';
import { Platform } from '@/lib/constants';
import apiClient from '@/lib/api/client';

interface PlatformAuthUrlResponse {
  authUrl: string;
  state?: string;
}

interface UsePlatformConnectionOptions {
  onSuccess?: (platform: Platform) => void;
  onError?: (error: Error, platform: Platform) => void;
}

export function usePlatformConnection(options?: UsePlatformConnectionOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPlatform, setLoadingPlatform] = useState<Platform | null>(null);

  const connect = async (platform: Platform) => {
    try {
      setIsLoading(true);
      setLoadingPlatform(platform);
      setError(null);

      const response = await apiClient.get<PlatformAuthUrlResponse>(
        `/platform-connections/${platform}/auth-url`
      );

      const { authUrl } = response.data;

      // Redirect to platform OAuth page
      window.location.href = authUrl;

      options?.onSuccess?.(platform);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || `Failed to connect to ${platform}`;
      setError(errorMessage);
      setIsLoading(false);
      setLoadingPlatform(null);

      options?.onError?.(new Error(errorMessage), platform);
    }
  };

  const disconnect = async (connectionId: string, platform: Platform) => {
    try {
      setIsLoading(true);
      setLoadingPlatform(platform);
      setError(null);

      await apiClient.delete(`/platform-connections/${connectionId}`);

      options?.onSuccess?.(platform);
      setIsLoading(false);
      setLoadingPlatform(null);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || `Failed to disconnect ${platform}`;
      setError(errorMessage);
      setIsLoading(false);
      setLoadingPlatform(null);

      options?.onError?.(new Error(errorMessage), platform);
    }
  };

  const toggleStatus = async (
    connectionId: string,
    platform: Platform,
    newStatus: 'active' | 'inactive'
  ) => {
    try {
      setIsLoading(true);
      setLoadingPlatform(platform);
      setError(null);

      await apiClient.patch(`/platform-connections/${connectionId}`, {
        status: newStatus,
      });

      options?.onSuccess?.(platform);
      setIsLoading(false);
      setLoadingPlatform(null);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || `Failed to update ${platform} status`;
      setError(errorMessage);
      setIsLoading(false);
      setLoadingPlatform(null);

      options?.onError?.(new Error(errorMessage), platform);
    }
  };

  return {
    connect,
    disconnect,
    toggleStatus,
    isLoading,
    loadingPlatform,
    error,
  };
}
