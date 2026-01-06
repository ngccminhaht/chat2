// Re-export from nest-keycloak-connect for compatibility
export { Public, Unprotected } from 'nest-keycloak-connect';

// Legacy key for backward compatibility (if any custom guards use this)
export const IS_PUBLIC_KEY = 'isPublic';
