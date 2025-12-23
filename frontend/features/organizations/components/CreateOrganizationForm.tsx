'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useCreateOrganization } from '../hooks/useCreateOrganization';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 50 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export default function CreateOrganizationForm() {
  const t = useTranslations('organizations');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');

  const createOrg = useCreateOrganization();

  useEffect(() => {
    if (!slugEdited && name) {
      setSlug(generateSlug(name));
    }
  }, [name, slugEdited]);

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(generateSlug(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrg.mutate({ name, slug, description: description || undefined });
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" gutterBottom>
          {t('createNew')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('getStarted')}
        </Typography>
      </Box>

      {createOrg.isError && (
        <Alert severity="error">
          {(createOrg.error as Error)?.message || 'Failed to create organization'}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <TextField
            label={t('name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoFocus
          />

          <TextField
            label={t('slug')}
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            required
            fullWidth
            helperText={
              slug && !isValidSlug(slug)
                ? 'Slug must be 3-50 chars, lowercase letters, numbers, and hyphens'
                : ''
            }
            error={slug.length > 0 && !isValidSlug(slug)}
          />

          <TextField
            label={t('description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={!name || !isValidSlug(slug) || createOrg.isPending}
          >
            {createOrg.isPending ? <CircularProgress size={24} /> : t('create')}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
