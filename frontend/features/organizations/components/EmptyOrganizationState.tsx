'use client';

import { Stack, Typography, Button } from '@mui/material';
import { useRouter } from 'next/navigation';
import BusinessIcon from '@mui/icons-material/Business';

export default function EmptyOrganizationState() {
  const router = useRouter();

  return (
    <Stack spacing={3} alignItems="center" py={8}>
      <BusinessIcon color="action" fontSize="large" />
      <Typography variant="h5">No Organizations Yet</Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center">
        Create your first organization to start managing conversations.
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={() => router.push('/organizations/new')}
      >
        Create Organization
      </Button>
    </Stack>
  );
}
