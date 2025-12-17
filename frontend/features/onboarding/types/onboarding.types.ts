export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface CreateOrganizationResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface InviteMemberRequest {
  email: string;
  role: 'admin' | 'agent' | 'viewer';
}

export interface InviteMemberResponse {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted';
}

export type OnboardingStep = 'create-organization' | 'connect-platforms' | 'invite-members';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'create-organization',
  'connect-platforms',
  'invite-members',
];
