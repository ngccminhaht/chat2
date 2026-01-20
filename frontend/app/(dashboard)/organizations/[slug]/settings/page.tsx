'use client';

import { useTranslations } from 'next-intl';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import { useAuthStore } from '@/features/auth/stores/authStore';
import { ApiKeySection } from '@/features/organizations';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const organization = useAuthStore((state) => state.organization);
  const currentRole = useAuthStore((state) => state.getCurrentRole());
  const isOwner = currentRole === 'owner';

  return (
    <Box sx={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <Paper sx={{ maxWidth: 900, mx: 'auto', my: 2, p: 3 }}>
        <Stack spacing={3}>
          <Typography variant="h5">{t('organization')}</Typography>

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
            />

            <TextField
              label={t('urlSlug')}
              defaultValue={organization?.slug || ''}
              fullWidth
              disabled
              helperText={t('urlSlugHelper')}
            />

            <TextField
              label={t('plan')}
              value={organization?.plan || 'free'}
              fullWidth
              disabled
              helperText={t('planHelper')}
            />
          </Stack>

          {isOwner && (
            <Box>
              <Button variant="contained" disabled>
                {t('saveChanges')}
              </Button>
            </Box>
          )}

          <Divider />

          <ApiKeySection />

          {isOwner && (
            <>
              <Divider />

              <Stack spacing={2}>
                <Typography variant="h6" color="error">
                  {t('dangerZone')}
                </Typography>
                <Alert severity="warning">
                  {t('deleteOrgWarning')}
                </Alert>
                <Box>
                  <Button variant="outlined" color="error" disabled>
                    {t('deleteOrg')}
                  </Button>
                </Box>
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
