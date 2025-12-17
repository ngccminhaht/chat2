"use client";

import {
  Box,
  Typography,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import apiClient from "@/lib/api/client";

interface FacebookPage {
  id: string;
  name: string;
  picture?: {
    data?: {
      url: string;
    };
  };
}

interface PendingPagesResponse {
  success: boolean;
  pages: FacebookPage[];
  isSyncMode: boolean;
}

function SelectPagesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid selection token");
      setIsLoading(false);
      return;
    }

    fetchPendingPages();
  }, [token]);

  const fetchPendingPages = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get<PendingPagesResponse>(
        `/connections/facebook/pending-pages?token=${token}`
      );

      setPages(response.data.pages);
      // Pre-select all pages by default
      setSelectedPageIds(response.data.pages.map((p) => p.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load pages");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePage = (pageId: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId)
        ? prev.filter((id) => id !== pageId)
        : [...prev, pageId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPageIds.length === pages.length) {
      setSelectedPageIds([]);
    } else {
      setSelectedPageIds(pages.map((p) => p.id));
    }
  };

  const handleSave = async () => {
    if (selectedPageIds.length === 0) {
      setError("Please select at least one page");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await apiClient.get(
        `/connections/facebook/save-pages?token=${token}&pageIds=${selectedPageIds.join(",")}`
      );

      // Redirect to connections page with success message
      router.push(
        `/integrations/connections?status=success&platform=facebook&account=${selectedPageIds.length} page${selectedPageIds.length > 1 ? "s" : ""}`
      );
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to save pages");
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && pages.length === 0) {
    return (
      <Box>
        <Alert severity="error">{error}</Alert>
        <Button
          variant="contained"
          onClick={() => router.push("/integrations/connections")}
        >
          Back to Connections
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Select Facebook Pages
      </Typography>

      <Typography variant="body1" color="text.secondary" gutterBottom>
        Choose which pages you want to connect to your account
      </Typography>

      {error && (
        <Box mb={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      <Box mb={2}>
        <FormControlLabel
          control={
            <Checkbox
              checked={selectedPageIds.length === pages.length}
              indeterminate={
                selectedPageIds.length > 0 &&
                selectedPageIds.length < pages.length
              }
              onChange={handleSelectAll}
            />
          }
          label={`Select All (${selectedPageIds.length}/${pages.length})`}
        />
      </Box>

      <Box mb={3}>
        {pages.map((page) => (
          <Card key={page.id} variant="outlined">
            <CardContent>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedPageIds.includes(page.id)}
                    onChange={() => handleTogglePage(page.id)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="h6">{page.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      ID: {page.id}
                    </Typography>
                  </Box>
                }
              />
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box display="flex" gap={2}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={handleSave}
          disabled={isSaving || selectedPageIds.length === 0}
        >
          {isSaving ? "Saving..." : `Connect ${selectedPageIds.length} Page${selectedPageIds.length > 1 ? "s" : ""}`}
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => router.push("/integrations/connections")}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

export default function SelectPagesPage() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      }
    >
      <SelectPagesContent />
    </Suspense>
  );
}
