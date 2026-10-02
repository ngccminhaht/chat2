'use client';

import { useState } from 'react';
import { Box, Typography, Drawer, IconButton, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import CustomerList from '@/features/customers/components/CustomerList';
import CustomerDetail from '@/features/customers/components/CustomerDetail';
import PageContainer from '@/components/layout/PageContainer';
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
    <PageContainer
      title="Danh sách khách hàng"
      action={
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          sx={{
            bgcolor: "#0060df",
            "&:hover": { bgcolor: "#004ecc" },
            borderRadius: "6px",
            fontSize: "12.5px",
            px: 1.75,
            py: 0.75,
          }}
        >
          Thêm khách hàng
        </Button>
      }
      noCardPadding
    >
      <CustomerList onSelectCustomer={handleSelectCustomer} />

      <Drawer
        anchor="right"
        open={!!selectedCustomer}
        onClose={handleCloseDetail}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 }, p: 2 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '1px solid #dfe3e8' }}>
          <Typography variant="h6" sx={{ fontSize: '15px', fontWeight: 600 }}>Chi tiết khách hàng</Typography>
          <IconButton size="small" onClick={handleCloseDetail}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {selectedCustomer && (
          <CustomerDetail customer={selectedCustomer} onClose={handleCloseDetail} />
        )}
      </Drawer>
    </PageContainer>
  );
}
