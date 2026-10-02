'use client';

import PageContainer from '@/components/layout/PageContainer';
import QuickRepliesTab from '@/features/settings/components/QuickRepliesTab';

export default function QuickRepliesPage() {
  return (
    <PageContainer
      title="Danh sách tin nhắn mẫu"
      helpText="Trợ giúp về Tin nhắn mẫu (Quick Replies)"
    >
      <QuickRepliesTab />
    </PageContainer>
  );
}
