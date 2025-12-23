'use client';

import { useTranslations } from 'next-intl';
import { Stack, Typography, Button } from '@mui/material';
import { useRouter } from 'next/navigation';
import BusinessIcon from '@mui/icons-material/Business';

export default function EmptyOrganizationState() {
  const router = useRouter();
  const t = useTranslations('organizations');

  return (
    <Stack spacing={3} alignItems="center" py={8}>
      <BusinessIcon color="action" fontSize="large" />
      <Typography variant="h5">{t('noOrganizations')}</Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center">
        {t('getStarted')}
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={() => router.push('/organizations/new')}
      >
        {t('createFirst')}
      </Button>
    </Stack>
  );
}
