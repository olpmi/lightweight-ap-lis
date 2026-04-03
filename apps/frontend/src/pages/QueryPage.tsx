import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Pagination,
  Stack,
  Chip,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { orderApi } from '../api';
import { formatOrderIdDisplay } from '@lis/shared';

export default function QueryPage() {
  const navigate = useNavigate();
  const [orderIdInput, setOrderIdInput] = useState('');
  const [patientIdInput, setPatientIdInput] = useState('');
  const [page, setPage] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const PAGE_SIZE = 20;

  // Only search when submitted
  const [queryParams, setQueryParams] = useState<{ orderId?: string; patientId?: string }>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['query', queryParams, page],
    queryFn: () => orderApi.query({ ...queryParams, page, pageSize: PAGE_SIZE }),
    enabled: submitted && (Boolean(queryParams.orderId) || Boolean(queryParams.patientId)),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryParams({
      orderId: orderIdInput.trim() || undefined,
      patientId: patientIdInput.trim() || undefined,
    });
    setPage(1);
    setSubmitted(true);
  };

  const orders = (data?.data ?? []) as Array<{
    orderId: string;
    registeredDate: string;
    caseType?: string;
    completedDate?: string;
    patient: { lastName: string; firstName: string; patientId: string };
    doctor: { lastName: string; firstName: string };
  }>;

  return (
    <Box>
      <Typography variant="h5" mb={3}>Query</Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box component="form" onSubmit={handleSearch}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
            <TextField
              label="Case ID"
              size="small"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              placeholder="SU250000001"
              sx={{ flex: 1 }}
              inputProps={{ 'data-testid': 'query-order-id' }}
            />
            <TextField
              label="Patient ID"
              size="small"
              value={patientIdInput}
              onChange={(e) => setPatientIdInput(e.target.value)}
              placeholder="P1234567"
              sx={{ flex: 1 }}
              inputProps={{ 'data-testid': 'query-patient-id' }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <Search />}
              disabled={(!orderIdInput && !patientIdInput) || isLoading}
              data-testid="query-search-btn"
            >
              Search
            </Button>
          </Stack>
        </Box>
      </Paper>

      {isError && <Alert severity="error">Search failed. Please try again.</Alert>}

      {submitted && (
        <Paper>
          <TableContainer>
            <Table size="small" data-testid="query-results-table">
              <TableHead>
                <TableRow>
                  <TableCell>Case ID</TableCell>
                  <TableCell>Patient</TableCell>
                  <TableCell>Patient ID</TableCell>
                  <TableCell>Clinician</TableCell>
                  <TableCell>Registered</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.orderId}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/result/${order.orderId}`)}
                    data-testid={`query-result-row-${order.orderId}`}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{formatOrderIdDisplay(order.orderId)}</Typography>
                    </TableCell>
                    <TableCell>{order.patient.lastName}, {order.patient.firstName}</TableCell>
                    <TableCell>{order.patient.patientId}</TableCell>
                    <TableCell>{order.doctor.lastName}, {order.doctor.firstName}</TableCell>
                    <TableCell>{new Date(order.registeredDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {order.completedDate
                        ? <Chip label="Signed Out" color="success" size="small" />
                        : <Chip label="In Progress" size="small" />}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No matching cases found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1}>
            <Typography variant="caption" color="text.secondary">{data?.total ?? 0} results</Typography>
            <Pagination
              count={Math.ceil(((data as { total?: number })?.total ?? 0) / PAGE_SIZE)}
              page={page}
              onChange={(_, p) => setPage(p)}
              size="small"
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}
