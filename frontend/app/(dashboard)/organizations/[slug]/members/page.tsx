'use client';

import PageContainer from '@/components/layout/PageContainer';
import OrganizationMembers from '@/features/organizations/components/OrganizationMembers';

export default function TeamPage() {
  return (
    <PageContainer
      title="Danh sách thành viên"
      helpText="Trợ giúp về Quản lý thành viên"
    >
      <OrganizationMembers />
    </PageContainer>
  );
}
