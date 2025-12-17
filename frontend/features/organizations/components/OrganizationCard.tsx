'use client';

import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Chip,
  Stack,
  CircularProgress,
  Box,
} from '@mui/material';
import type { Organization } from '@/features/auth/types/auth.types';

interface Props {
  organization: Organization;
  onClick: () => void;
  loading?: boolean;
}

export default function OrganizationCard({ organization, onClick, loading }: Props) {
  return (
    <Card>
      <CardActionArea onClick={onClick} disabled={loading}>
        <CardContent>
          <Stack spacing={1}>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">{organization.name}</Typography>
              {loading && <CircularProgress size={20} />}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {organization.slug}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Chip label={organization.plan} size="small" />
              <Chip label={organization.role} size="small" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
