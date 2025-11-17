import { useState } from 'react';

export const useConnectZalo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectZalo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Redirect directly to backend authorize endpoint
      // Backend will handle state storage in Redis and redirect to Zalo
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      window.location.href = `${apiUrl}/platform-connections/zalo/authorize`;
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
