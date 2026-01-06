import axios from 'axios';
import { useAuthStore } from '@/features/auth';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401 errors
// Note: With Keycloak SSO, token refresh is handled by KeycloakProvider
// 401 errors are just rejected - Keycloak will handle re-authentication
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Just reject the error - let Keycloak handle auth
    // Don't clear auth or redirect here to avoid race conditions with Keycloak
    return Promise.reject(error);
  }
);

export default apiClient;
