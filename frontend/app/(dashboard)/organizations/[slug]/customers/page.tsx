'use client';

import { useState } from 'react';
import { Box, Typography, Drawer, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CustomerList from '@/features/customers/components/CustomerList';
import CustomerDetail from '@/features/customers/components/CustomerDetail';
import { Customer } from '@/features/customers/types/customer.types';

export default function CustomersPage() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleCloseDetail = () => {
    setSelectedCustomer(null);
  };

  return (
    <Box sx={{ height: 'calc(100vh - 112px)' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Customers
      </Typography>

      <Box sx={{ height: 'calc(100% - 48px)' }}>
        <CustomerList onSelectCustomer={handleSelectCustomer} />
      </Box>

      <Drawer
        anchor="right"
        open={!!selectedCustomer}
        onClose={handleCloseDetail}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 } },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Customer Details</Typography>
          <IconButton onClick={handleCloseDetail}>
            <CloseIcon />
          </IconButton>
        </Box>
        {selectedCustomer && (
          <CustomerDetail customer={selectedCustomer} onClose={handleCloseDetail} />
        )}
      </Drawer>
    </Box>
  );
}
