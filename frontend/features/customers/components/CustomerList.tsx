"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Checkbox,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ComputerIcon from "@mui/icons-material/Computer";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import TabletIcon from "@mui/icons-material/Tablet";
import LanguageIcon from "@mui/icons-material/Language";
import FacebookIcon from "@mui/icons-material/Facebook";
import ChatIcon from "@mui/icons-material/Chat";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import WebIcon from "@mui/icons-material/Web";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import EmptyState from "@/components/common/EmptyState";
import { useCustomers, useCustomerDomains } from "../hooks/useCustomers";
import { Customer, GetCustomersParams } from "../types/customer.types";
import { formatDistanceToNow } from "date-fns";

interface CustomerListProps {
  onSelectCustomer?: (customer: Customer) => void;
}

function getDeviceIcon(device?: string) {
  switch (device) {
    case "mobile":
      return <PhoneIphoneIcon sx={{ fontSize: 16 }} />;
    case "tablet":
      return <TabletIcon sx={{ fontSize: 16 }} />;
    default:
      return <ComputerIcon sx={{ fontSize: 16 }} />;
  }
}

const platformIcons: Record<string, React.ReactNode> = {
  facebook: <FacebookIcon sx={{ fontSize: 15 }} />,
  zalo: <ChatIcon sx={{ fontSize: 15 }} />,
  tiktok: <ShoppingBagIcon sx={{ fontSize: 15 }} />,
  shopee: <ShoppingBagIcon sx={{ fontSize: 15 }} />,
  web: <WebIcon sx={{ fontSize: 15 }} />,
};

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    zalo: "Zalo",
    tiktok: "TikTok",
    shopee: "Shopee",
    web: "Web",
  };
  return labels[platform] || platform;
}

export default function CustomerList({ onSelectCustomer }: CustomerListProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params: GetCustomersParams = {
    search: debouncedSearch || undefined,
    domain: domainFilter || undefined,
    platform: platformFilter || undefined,
    page: page + 1,
    limit: rowsPerPage,
    sortBy: "lastSeenAt",
    sortOrder: "desc",
  };

  const { data, isLoading, error } = useCustomers(params);
  const { data: domains } = useCustomerDomains();

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const customers = data?.data || [];
  const totalCount = data?.meta?.total || 0;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(customers.map((c) => c._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredCustomers = customers.filter((customer) => {
    if (activeCategory === "phone") return Boolean(customer.phone);
    if (activeCategory === "email") return Boolean(customer.email);
    return true;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Category Tabs */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: "1px solid #dfe3e8" }}
      >
        {[
          { id: "all", label: "Tất cả khách hàng" },
          { id: "phone", label: "Có số điện thoại" },
          { id: "email", label: "Có email" },
        ].map((cat) => {
          const isSelected = activeCategory === cat.id;
          return (
            <Box
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
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
              {cat.label}
            </Box>
          );
        })}
      </Stack>

      {/* Filter Toolbar */}
      <Box sx={{ p: 1.5, borderBottom: "1px solid #dfe3e8" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1, flexWrap: "wrap", gap: 1 }}>
            <TextField
              size="small"
              placeholder="Tìm kiếm theo tên, email, SĐT..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
                maxWidth: { xs: "100%", sm: 380 },
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#ffffff",
                  fontSize: "12.5px",
                  height: 34,
                },
              }}
            />

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ fontSize: "12px", top: -2 }}>Domain</InputLabel>
              <Select
                value={domainFilter}
                label="Domain"
                sx={{ height: 34, fontSize: "12.5px", bgcolor: "#ffffff" }}
                onChange={(e) => {
                  setDomainFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="" sx={{ fontSize: "12.5px" }}>Tất cả domain</MenuItem>
                {domains?.map((domain) => (
                  <MenuItem key={domain} value={domain} sx={{ fontSize: "12.5px" }}>
                    {domain}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ fontSize: "12px", top: -2 }}>Nguồn</InputLabel>
              <Select
                value={platformFilter}
                label="Nguồn"
                sx={{ height: 34, fontSize: "12.5px", bgcolor: "#ffffff" }}
                onChange={(e) => {
                  setPlatformFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="" sx={{ fontSize: "12.5px" }}>Tất cả</MenuItem>
                <MenuItem value="zalo" sx={{ fontSize: "12.5px" }}>Zalo</MenuItem>
                <MenuItem value="facebook" sx={{ fontSize: "12.5px" }}>Facebook</MenuItem>
                <MenuItem value="tiktok" sx={{ fontSize: "12.5px" }}>TikTok</MenuItem>
                <MenuItem value="shopee" sx={{ fontSize: "12.5px" }}>Shopee</MenuItem>
                <MenuItem value="web" sx={{ fontSize: "12.5px" }}>Web</MenuItem>
              </Select>
            </FormControl>

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
                "&:hover": { bgcolor: "#f6f8fa", borderColor: "#c4cdd5" },
              }}
            >
              Bộ lọc +
            </Button>
          </Stack>

          <Typography
            variant="body2"
            sx={{
              color: "#6d7175",
              fontSize: "12px",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Có {totalCount} khách hàng
          </Typography>
        </Stack>
      </Box>

      {/* Table Area */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {isLoading && <LoadingSpinner />}
        {error && <EmptyState message="Lỗi khi tải danh sách khách hàng" />}
        {!isLoading && !error && filteredCustomers.length === 0 && (
          <EmptyState message="Không tìm thấy khách hàng nào" />
        )}
        {!isLoading && !error && filteredCustomers.length > 0 && (
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "#f9fafb" }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedIds.length > 0 && selectedIds.length === filteredCustomers.length}
                      indeterminate={selectedIds.length > 0 && selectedIds.length < filteredCustomers.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Khách hàng</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Liên hệ</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Nguồn</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Thiết bị</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Domain</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Tin nhắn</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "12px", color: "#637381" }}>Lần cuối</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedIds.includes(customer._id);
                  return (
                    <TableRow
                      key={customer._id}
                      hover
                      selected={isSelected}
                      onClick={() => onSelectCustomer?.(customer)}
                      sx={{
                        cursor: "pointer",
                        "&:hover": { bgcolor: "#f9fafb" },
                        "&.Mui-selected": { bgcolor: "#f0f7ff" },
                      }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => handleSelectOne(customer._id, e)}>
                        <Checkbox size="small" checked={isSelected} />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            src={customer.avatar}
                            sx={{ width: 28, height: 28, bgcolor: "#e7f1ff", color: "#0060df", fontSize: "12px", fontWeight: 600 }}
                          >
                            {customer.name?.charAt(0)?.toUpperCase() || "V"}
                          </Avatar>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontSize: "12.5px",
                                color: "#0060df",
                                "&:hover": { textDecoration: "underline" },
                              }}
                            >
                              {customer.name || "Khách truy cập"}
                            </Typography>
                            {customer.tags?.length > 0 && (
                              <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                                {customer.tags.slice(0, 2).map((tag) => (
                                  <Chip key={tag} label={tag} size="small" sx={{ height: 18, fontSize: "10px" }} />
                                ))}
                                {customer.tags.length > 2 && (
                                  <Chip
                                    label={`+${customer.tags.length - 2}`}
                                    size="small"
                                    sx={{ height: 18, fontSize: "10px" }}
                                  />
                                )}
                              </Stack>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: "12.5px" }}>
                          {customer.email || "-"}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#6d7175", fontSize: "11px" }}>
                          {customer.phone || ""}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {customer.platformIdentities && customer.platformIdentities.length > 0 ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                            {customer.platformIdentities.map((identity, idx) => (
                              <Chip
                                key={idx}
                                icon={platformIcons[identity.platform] as any}
                                label={getPlatformLabel(identity.platform)}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "11px" }}
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "12px" }}>
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip
                          title={`${customer.deviceInfo?.browser || "Unknown"} trên ${
                            customer.deviceInfo?.os || "Unknown"
                          }`}
                        >
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {getDeviceIcon(customer.deviceInfo?.device)}
                            <Typography variant="body2" sx={{ fontSize: "12px", color: "#6d7175" }}>
                              {customer.deviceInfo?.os || "Unknown"}
                            </Typography>
                          </Stack>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <LanguageIcon sx={{ fontSize: 15, color: "#8c9196" }} />
                          <Typography variant="body2" sx={{ fontSize: "12.5px" }}>
                            {customer.lastSeenDomain || "-"}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: "12.5px" }}>
                          {customer.totalMessages}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: "12px", color: "#6d7175" }}>
                          {customer.lastSeenAt
                            ? formatDistanceToNow(new Date(customer.lastSeenAt), {
                                addSuffix: true,
                              })
                            : "-"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={totalCount}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
        sx={{
          borderTop: "1px solid #dfe3e8",
          ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows": {
            fontSize: "12px",
            color: "#6d7175",
          },
        }}
      />

      {/* Haravan Help Pill Button */}
      <Box className="app-help-footer">
        <Button
          className="app-help-button"
          variant="outlined"
          size="small"
          startIcon={<HelpOutlineIcon sx={{ fontSize: 16 }} />}
        >
          Trợ giúp về Khách hàng
        </Button>
      </Box>
    </Box>
  );
}
