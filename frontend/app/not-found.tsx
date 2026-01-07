'use client';

import { Box, Typography, Button } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      gap={2}
    >
      <Typography variant="h1" color="text.secondary">
        404
      </Typography>
      <Typography variant="h6" color="text.secondary">
        Page not found
      </Typography>
      <Button
        variant="contained"
        startIcon={<HomeIcon />}
        onClick={() => router.push('/')}
      >
        Go Home
      </Button>
    </Box>
  );
}
