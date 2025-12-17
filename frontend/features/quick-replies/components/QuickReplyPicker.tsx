'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Popper,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Box,
  CircularProgress,
  Chip,
  Stack,
} from '@mui/material';
import { useQuickReplies, useTrackQuickReplyUsage } from '../hooks/useQuickReplies';
import { QuickReply } from '../types/quick-reply.types';

interface QuickReplyPickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  searchText: string; // The text after "/" that user typed
  onSelect: (content: string) => void;
  onClose: () => void;
}

/**
 * Popup picker for quick replies triggered by "/" in message input
 */
export default function QuickReplyPicker({
  anchorEl,
  open,
  searchText,
  onSelect,
  onClose,
}: QuickReplyPickerProps) {
  const { data, isLoading } = useQuickReplies({ limit: 100 });
  const { mutate: trackUsage } = useTrackQuickReplyUsage();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter replies based on search text
  const filteredReplies = useMemo(() => {
    if (!data?.data) return [];
    if (!searchText) return data.data;

    const lowerSearch = searchText.toLowerCase();
    return data.data.filter(
      (reply) =>
        reply.shortcut.toLowerCase().includes(lowerSearch) ||
        reply.title.toLowerCase().includes(lowerSearch)
    );
  }, [data?.data, searchText]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredReplies]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredReplies.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredReplies[selectedIndex]) {
            handleSelect(filteredReplies[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredReplies, selectedIndex, onClose]);

  const handleSelect = (reply: QuickReply) => {
    // Track usage
    trackUsage(reply._id);
    // Pass content to parent
    onSelect(reply.content);
    onClose();
  };

  if (!open) return null;

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="top-start"
      style={{ zIndex: 1300 }}
    >
      <Paper sx={{ width: 350, maxHeight: 300, overflow: 'auto' }}>
        {isLoading ? (
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress size={24} />
          </Box>
        ) : filteredReplies.length === 0 ? (
          <Box p={2}>
            <Typography variant="body2" color="text.secondary">
              No quick replies found
            </Typography>
          </Box>
        ) : (
          <List dense>
            {filteredReplies.map((reply, index) => (
              <ListItemButton
                key={reply._id}
                selected={index === selectedIndex}
                onClick={() => handleSelect(reply)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={reply.shortcut}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                      <Typography variant="body2">{reply.title}</Typography>
                    </Stack>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {reply.content}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>
    </Popper>
  );
}
