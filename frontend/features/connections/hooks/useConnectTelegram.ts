import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/stores/authStore';

interface ConnectTelegramRequest {
  organizationId: string;
  botToken: string;
}

interface ConnectTelegramResponse {
  id: string;
  platform: string;
  platformAccountId: string;
  platformAccountName: string;
  status: string;
}

export const useConnectTelegram = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const organization = useAuthStore((state) => state.organization);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: ConnectTelegramRequest) => {
      const response = await apiClient.post<ConnectTelegramResponse>(
        '/telegram/connect',
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platformConnections'] });
      setIsOpen(false);
      setBotToken('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || err.message || 'Failed to connect Telegram bot');
    },
  });

  const openDialog = () => {
    setIsOpen(true);
    setError(null);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setBotToken('');
    setError(null);
  };

  const handleConnect = async () => {
    if (!organization?.id) {
      setError('Organization not selected');
      return;
    }

    if (!botToken.trim()) {
      setError('Bot token is required');
      return;
    }

    // Validate bot token format (should be like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)
    const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!tokenPattern.test(botToken.trim())) {
      setError('Invalid bot token format. Expected format: 123456:ABC-DEF1234ghIkl...');
      return;
    }

    mutation.mutate({
      organizationId: organization.id,
      botToken: botToken.trim(),
    });
  };

  return {
    isOpen,
    openDialog,
    closeDialog,
    botToken,
    setBotToken,
    handleConnect,
    isLoading: mutation.isPending,
    error,
  };
};
