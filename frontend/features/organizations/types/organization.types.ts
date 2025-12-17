export type OrganizationRole = 'owner' | 'admin' | 'agent' | 'viewer';

export interface OrganizationMember {
  id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  role: OrganizationRole;
  joinedAt: string;
}

export interface InviteMemberRequest {
  email: string;
  role: OrganizationRole;
}

export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}
