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

// Auth routes that should not trigger redirect on 401
const AUTH_ROUTES = ['/login', '/register', '/auth/callback'];

// Response interceptor to handle 401 errors
// Note: With Keycloak SSO, token refresh is handled by KeycloakProvider
// When token is invalid/expired, redirect to login for re-authentication
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Check if we're on an auth route - don't redirect to prevent loops
      const isAuthRoute = typeof window !== 'undefined' &&
        AUTH_ROUTES.some(route => window.location.pathname.startsWith(route));

      if (!isAuthRoute) {
        console.log('[apiClient] 401 Unauthorized - clearing auth and redirecting to login');
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
      // On auth routes, just reject the error without redirecting
    }

    return Promise.reject(error);
  }
);

export default apiClient;
