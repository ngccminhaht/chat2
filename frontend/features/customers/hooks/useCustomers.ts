import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { CustomersResponse, GetCustomersParams } from '../types/customer.types';
import { useAuthStore } from '@/features/auth/stores/authStore';

export function useCustomers(params: GetCustomersParams = {}) {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<CustomersResponse>({
    queryKey: ['customers', organizationId, params],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/customers`,
        { params }
      );
      return data;
    },
    enabled: !!organizationId,
  });
}

export function useCustomerDomains() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<string[]>({
    queryKey: ['customer-domains', organizationId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/customers/filters/domains`
      );
      return data;
    },
    enabled: !!organizationId,
  });
}

export function useCustomerTags() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  return useQuery<string[]>({
    queryKey: ['customer-tags', organizationId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/organizations/${organizationId}/customers/filters/tags`
      );
      return data;
    },
    enabled: !!organizationId,
  });
}
