"use client";

import React from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  InputAdornment,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

export interface FilterTabItem {
  id: string;
  label: string;
  count?: number;
}

interface PageContainerProps {
  title: string;
  action?: React.ReactNode;
  filterTabs?: FilterTabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  extraFilter?: React.ReactNode;
  totalCountText?: string;
  helpText?: string;
  onHelpClick?: () => void;
  children: React.ReactNode;
  cardSx?: object;
  noCardPadding?: boolean;
}

export default function PageContainer({
  title,
  action,
  filterTabs,
  activeTab,
  onTabChange,
  searchPlaceholder = "Tìm kiếm",
  searchValue,
  onSearchChange,
  extraFilter,
  totalCountText,
  helpText,
  onHelpClick,
  children,
  cardSx,
  noCardPadding = false,
}: PageContainerProps) {
  const hasFilterBar =
    (filterTabs && filterTabs.length > 0) ||
    onSearchChange !== undefined ||
    extraFilter !== undefined ||
    totalCountText !== undefined;

  return (
    <Box className="app-page-wrapper">
      {/* Haravan Page Header */}
      <Box className="app-page-header">
        <Typography variant="h5" component="h1" className="app-page-title">
          {title}
        </Typography>
        {action && <Box sx={{ display: "flex", alignItems: "center" }}>{action}</Box>}
      </Box>

      {/* Haravan Main Card */}
      <Paper className="app-page-card" variant="outlined" sx={cardSx}>
        {/* Top Filter and Tab Bar */}
        {hasFilterBar && (
          <Box sx={{ borderBottom: "1px solid #dfe3e8" }}>
            {/* Category Pills / Tabs */}
            {filterTabs && filterTabs.length > 0 && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: "1px solid #f1f3f5" }}
              >
                {filterTabs.map((tab) => {
                  const isSelected = activeTab === tab.id;
                  return (
                    <Box
                      key={tab.id}
                      onClick={() => onTabChange?.(tab.id)}
                      sx={{
                        cursor: "pointer",
                        px: 1.75,
                        py: 0.5,
                        borderRadius: "20px",
                        fontSize: "12.5px",
                        fontWeight: isSelected ? 600 : 500,
                        bgcolor: isSelected ? "#e7f1ff" : "transparent",
                        color: isSelected ? "#0060df" : "#454f5b",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          bgcolor: isSelected ? "#e7f1ff" : "#f1f3f5",
                        },
                      }}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <Box
                          component="span"
                          sx={{
                            ml: 0.75,
                            fontSize: "11px",
                            opacity: 0.8,
                          }}
                        >
                          ({tab.count})
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}

            {/* Search, Filter button, and Count */}
            {(onSearchChange || extraFilter || totalCountText) && (
              <Box sx={{ p: 1.5 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                    {onSearchChange && (
                      <TextField
                        size="small"
                        placeholder={searchPlaceholder}
                        value={searchValue ?? ""}
                        onChange={(e) => onSearchChange(e.target.value)}
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon sx={{ fontSize: 17, color: "#8c9196" }} />
                              </InputAdornment>
                            ),
                            endAdornment: (
                              <InputAdornment position="end">
                                <Tooltip title="Sắp xếp">
                                  <IconButton size="small" edge="end" sx={{ color: "#8c9196" }}>
                                    <SwapVertIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </InputAdornment>
                            ),
                          },
                        }}
                        sx={{
                          flexGrow: 1,
                          maxWidth: { xs: "100%", sm: 460 },
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "#ffffff",
                            fontSize: "12.5px",
                            height: 34,
                          },
                        }}
                      />
                    )}

                    {extraFilter}

                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<FilterListIcon sx={{ fontSize: 15 }} />}
                      sx={{
                        color: "#454f5b",
                        borderColor: "#dfe3e8",
                        bgcolor: "#ffffff",
                        height: 34,
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                        "&:hover": { bgcolor: "#f6f8fa", borderColor: "#c4cdd5" },
                      }}
                    >
                      Bộ lọc +
                    </Button>
                  </Stack>

                  {totalCountText && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#6d7175",
                        fontSize: "12px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        textAlign: { xs: "left", sm: "right" },
                      }}
                    >
                      {totalCountText}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
          </Box>
        )}

        {/* Card Content */}
        <Box sx={{ p: noCardPadding ? 0 : 2.5 }}>{children}</Box>

        {/* Haravan Help Pill Button at bottom */}
        {helpText && (
          <Box className="app-help-footer">
            <Button
              className="app-help-button"
              variant="outlined"
              size="small"
              startIcon={<HelpOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={onHelpClick}
            >
              {helpText}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
