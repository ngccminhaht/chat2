import { Box, Typography } from '@mui/material';

interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="200px"
    >
      <Typography variant="body1" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}
