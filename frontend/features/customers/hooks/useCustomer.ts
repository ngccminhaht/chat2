import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Customer, UpdateCustomerData } from '../types/customer.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

export function useCustomer(customerId: string | undefined) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<Customer>({
    queryKey: ['customer', organizationId, customerId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/customers/${customerId}`
      );
      return data;
    },
    enabled: !!organizationId && !!customerId,
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async ({ customerId, data }: { customerId: string; data: UpdateCustomerData }) => {
      const response = await apiClient.patch(
        `/organizations/${organizationId}/customers/${customerId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customer', organizationId, customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers', organizationId] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiClient.delete(
        `/organizations/${organizationId}/customers/${customerId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', organizationId] });
    },
  });
}
