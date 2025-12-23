'use client';

import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  Collapse,
} from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';

export interface ConversationFiltersState {
  status?: 'open' | 'closed' | 'archived';
  platform?: 'facebook' | 'zalo' | 'tiktok' | 'shopee';
}

interface ConversationFiltersProps {
  filters: ConversationFiltersState;
  onFiltersChange: (filters: ConversationFiltersState) => void;
  expanded: boolean;
}

export default function ConversationFilters({
  filters,
  onFiltersChange,
  expanded,
}: ConversationFiltersProps) {
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

  return (
    <Collapse in={expanded}>
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
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

        {/* Status Filter */}
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
  );
}

// Helper to get filter count for badge
export function getActiveFilterCount(filters: ConversationFiltersState): number {
  return Object.values(filters).filter((v) => v !== undefined).length;
}
