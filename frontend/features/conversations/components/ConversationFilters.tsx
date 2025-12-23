'use client';

import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useState } from 'react';

export interface ConversationFiltersState {
  status?: 'open' | 'closed' | 'archived';
  platform?: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
}

interface ConversationFiltersProps {
  filters: ConversationFiltersState;
  onFiltersChange: (filters: ConversationFiltersState) => void;
}

export default function ConversationFilters({
  filters,
  onFiltersChange,
}: ConversationFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const handleFilterChange = (key: keyof ConversationFiltersState, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  // Count active filters
  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined).length;

  return (
    <Box>
      {/* Filter Toggle Button */}
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          color={hasActiveFilters ? 'primary' : 'default'}
        >
          <FilterIcon fontSize="small" />
        </IconButton>
        {activeFilterCount > 0 && (
          <>
            <Chip
              label={`${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}`}
              size="small"
              onDelete={handleClearFilters}
              color="primary"
              variant="outlined"
            />
          </>
        )}
      </Stack>

      {/* Collapsible Filter Panel */}
      <Collapse in={expanded}>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {/* Platform Filter */}
          <FormControl size="small" fullWidth>
            <InputLabel>Platform</InputLabel>
            <Select
              value={filters.platform || ''}
              label="Platform"
              onChange={(e) => handleFilterChange('platform', e.target.value as any)}
            >
              <MenuItem value="">All Platforms</MenuItem>
              <MenuItem value="facebook">Facebook</MenuItem>
              <MenuItem value="zalo">Zalo</MenuItem>
              <MenuItem value="tiktok">TikTok</MenuItem>
              <MenuItem value="shopee">Shopee</MenuItem>
            </Select>
          </FormControl>

          {/* Status Filter - now outside tabs for additional filtering */}
          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status || ''}
              label="Status"
              onChange={(e) => handleFilterChange('status', e.target.value as any)}
            >
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </Select>
          </FormControl>

          {/* Clear All Button */}
          {hasActiveFilters && (
            <Box display="flex" justifyContent="flex-end">
              <Chip
                icon={<ClearIcon />}
                label="Clear all"
                size="small"
                onClick={handleClearFilters}
                variant="outlined"
              />
            </Box>
          )}
        </Stack>
      </Collapse>
    </Box>
  );
}
