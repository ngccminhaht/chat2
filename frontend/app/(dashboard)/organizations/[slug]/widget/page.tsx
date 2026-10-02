'use client';

import PageContainer from '@/components/layout/PageContainer';
import WidgetTab from '@/features/settings/components/WidgetTab';

export default function WidgetPage() {
  return (
    <PageContainer
      title="Cài đặt Widget Chat"
      helpText="Trợ giúp về Cấu hình Widget Chat"
    >
      <WidgetTab />
    </PageContainer>
  );
}
