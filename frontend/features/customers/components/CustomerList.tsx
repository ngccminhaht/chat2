'use client';

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ComputerIcon from '@mui/icons-material/Computer';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import TabletIcon from '@mui/icons-material/Tablet';
import LanguageIcon from '@mui/icons-material/Language';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';
import { useCustomers, useCustomerDomains } from '../hooks/useCustomers';
import { Customer, GetCustomersParams } from '../types/customer.types';
import { formatDistanceToNow } from 'date-fns';

interface CustomerListProps {
  onSelectCustomer?: (customer: Customer) => void;
}

function getDeviceIcon(device?: string) {
  switch (device) {
    case 'mobile':
      return <PhoneIphoneIcon fontSize="small" />;
    case 'tablet':
      return <TabletIcon fontSize="small" />;
    default:
      return <ComputerIcon fontSize="small" />;
  }
}

export default function CustomerList({ onSelectCustomer }: CustomerListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [domainFilter, setDomainFilter] = useState<string>('');

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
    page: page + 1,
    limit: rowsPerPage,
    sortBy: 'lastSeenAt',
    sortOrder: 'desc',
  };

  const { data, isLoading, error } = useCustomers(params);
  const { data: domains } = useCustomerDomains();

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const customers = data?.data || [];
  const totalCount = data?.meta?.total || 0;

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField
            placeholder="Search by name, email, phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Domain</InputLabel>
            <Select
              value={domainFilter}
              label="Domain"
              onChange={(e) => {
                setDomainFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All domains</MenuItem>
              {domains?.map((domain) => (
                <MenuItem key={domain} value={domain}>
                  {domain}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {isLoading && <LoadingSpinner />}
        {error && <EmptyState message="Error loading customers" />}
        {!isLoading && !error && customers.length === 0 && (
          <EmptyState message="No customers found" />
        )}
        {!isLoading && !error && customers.length > 0 && (
          <TableContainer>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Domain</TableCell>
                  <TableCell>Messages</TableCell>
                  <TableCell>Last Seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer._id}
                    hover
                    onClick={() => onSelectCustomer?.(customer)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar src={customer.avatar}>
                          {customer.name?.charAt(0)?.toUpperCase() || 'V'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {customer.name || 'Visitor'}
                          </Typography>
                          {customer.tags?.length > 0 && (
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                              {customer.tags.slice(0, 2).map((tag) => (
                                <Chip key={tag} label={tag} size="small" />
                              ))}
                              {customer.tags.length > 2 && (
                                <Chip label={`+${customer.tags.length - 2}`} size="small" />
                              )}
                            </Stack>
                          )}
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {customer.email || '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {customer.phone || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={`${customer.deviceInfo?.browser || 'Unknown'} on ${customer.deviceInfo?.os || 'Unknown'}`}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          {getDeviceIcon(customer.deviceInfo?.device)}
                          <Typography variant="body2">
                            {customer.deviceInfo?.os || 'Unknown'}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <LanguageIcon fontSize="small" color="action" />
                        <Typography variant="body2">
                          {customer.lastSeenDomain || '-'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {customer.totalMessages}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {customer.lastSeenAt
                          ? formatDistanceToNow(new Date(customer.lastSeenAt), { addSuffix: true })
                          : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <TablePagination
        component="div"
        count={totalCount}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
    </Paper>
  );
}
