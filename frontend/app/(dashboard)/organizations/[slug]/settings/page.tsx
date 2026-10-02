'use client';

import { useTranslations } from 'next-intl';
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import PageContainer from '@/components/layout/PageContainer';
import { useAuthStore } from '@/features/auth/stores/authStore';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const organization = useAuthStore((state) => state.organization);
  const currentRole = useAuthStore((state) => state.getCurrentRole());
  const isOwner = currentRole === 'owner';

  return (
    <PageContainer
      title="Cấu hình tổ chức"
      helpText="Trợ giúp về Cấu hình tổ chức"
    >
      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        <Typography variant="h6" sx={{ fontSize: '15px', fontWeight: 600 }}>
          {t('organization')}
        </Typography>

        {!isOwner && (
          <Alert severity="info">
            {t('ownerOnly')}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label={t('orgName')}
            defaultValue={organization?.name || ''}
            fullWidth
            disabled={!isOwner}
            size="small"
          />

          <TextField
            label={t('urlSlug')}
            defaultValue={organization?.slug || ''}
            fullWidth
            disabled
            helperText={t('urlSlugHelper')}
            size="small"
          />

          <TextField
            label={t('plan')}
            value={organization?.plan || 'free'}
            fullWidth
            disabled
            helperText={t('planHelper')}
            size="small"
          />
        </Stack>

        {isOwner && (
          <Box>
            <Button
              variant="contained"
              disabled
              sx={{
                bgcolor: "#0060df",
                borderRadius: "6px",
                fontSize: "12.5px",
              }}
            >
              {t('saveChanges')}
            </Button>
          </Box>
        )}

        {isOwner && (
          <>
            <Divider sx={{ my: 2 }} />

            <Stack spacing={2}>
              <Typography variant="subtitle1" color="error" sx={{ fontWeight: 600 }}>
                {t('dangerZone')}
              </Typography>
              <Alert severity="warning">
                {t('deleteOrgWarning')}
              </Alert>
              <Box>
                <Button variant="outlined" color="error" disabled size="small" sx={{ borderRadius: "6px" }}>
                  {t('deleteOrg')}
                </Button>
              </Box>
            </Stack>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
