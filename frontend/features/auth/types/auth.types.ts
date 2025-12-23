export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  avatar?: string;
  role?: 'admin' | 'agent' | 'viewer';
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'agent' | 'viewer';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  organizationName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  organizations: Organization[];
}

export interface SwitchOrganizationRequest {
  organizationId: string;
}

export interface SwitchOrganizationResponse {
  accessToken: string;
  refreshToken: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}
