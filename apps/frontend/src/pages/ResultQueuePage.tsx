import React, { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Pagination,
  Chip,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { orderApi } from '../api';
import { formatOrderIdDisplay } from '@lis/shared';

export default function ResultQueuePage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const PAGE_SIZE = 20;

  const { data, isLoading, isError } = useQuery<{
    data: object[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ['result-queue', page, search],
    queryFn: () => orderApi.resultQueue(page, PAGE_SIZE, search),
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>;
  if (isError) return <Alert severity="error">Failed to load result queue</Alert>;

  const orders = (data?.data ?? []) as Array<{
    orderId: string;
    registeredDate: string;
    caseType?: string;
    isReactivated: boolean;
    patient: { lastName: string; firstName: string; patientId: string };
    doctor: { lastName: string; firstName: string };
    specimens: object[];
  }>;

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} gap={2} flexWrap="wrap">
        <Typography variant="h5">Result Queue</Typography>
        <TextField
          size="small"
          placeholder="Search case ID or patient name"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ width: 260 }}
        />
      </Box>
      <Paper>
        <TableContainer>
          <Table size="small" data-testid="result-queue-table">
            <TableHead>
              <TableRow>
                <TableCell>Case ID</TableCell>
                <TableCell>Patient</TableCell>
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
                  data-testid={`result-row-${order.orderId}`}
                >
                  <TableCell>
                      <Typography variant="body2" fontWeight={600}>{formatOrderIdDisplay(order.orderId)}</Typography>
                  </TableCell>
                  <TableCell>
                    {order.patient.lastName}, {order.patient.firstName}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {order.patient.patientId}
                    </Typography>
                  </TableCell>
                  <TableCell>{order.doctor.lastName}, {order.doctor.firstName}</TableCell>
                  <TableCell>{new Date(order.registeredDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {order.isReactivated ? (
                      <Chip label="Reactivated" color="warning" size="small" />
                    ) : (
                      <Chip label="Pending Result" size="small" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No cases pending result</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1}>
          <Typography variant="caption" color="text.secondary">{data?.total ?? 0} cases</Typography>
          <Pagination count={Math.ceil((data?.total ?? 0) / PAGE_SIZE)} page={page} onChange={(_, p) => setPage(p)} size="small" />
        </Box>
      </Paper>
    </Box>
  );
}
