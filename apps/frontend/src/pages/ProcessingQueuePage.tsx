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
  FormControlLabel,
  Switch,
  Chip,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { orderApi } from '../api';
import { qk } from '../api/queryKeys';
import { formatOrderIdDisplay } from '@lis/shared';
import { useLanguage } from '../hooks/useLanguage';

export default function ProcessingQueuePage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const { t, tCaseType } = useLanguage();
  const PAGE_SIZE = 20;

  const { data, isLoading, isError } = useQuery<{
    data: object[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: qk.processingQueue.byParams(page, showAll, search),
    queryFn: () => orderApi.processingQueue(page, PAGE_SIZE, showAll, search),
    placeholderData: keepPreviousData,
  });

  if (isLoading)
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  if (isError) return <Alert severity="error">{t('errorGeneric')}</Alert>;

  const orders = (data?.data ?? []) as Array<{
    orderId: string;
    registeredDate: string;
    caseType?: string;
    patient: { lastName: string; firstName: string; patientId: string };
    doctor: { lastName: string; firstName: string };
    specimens: object[];
  }>;

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} gap={2} flexWrap="wrap">
        <Typography variant="h5">{t('pq_title')}</Typography>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <TextField
            size="small"
            placeholder={t('pq_searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ width: 260 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={showAll}
                onChange={(e) => {
                  setShowAll(e.target.checked);
                  setPage(1);
                }}
                data-testid="show-all-toggle"
              />
            }
            label={t('pq_showAll')}
          />
        </Box>
      </Box>

      <Paper>
        <TableContainer>
          <Table size="small" data-testid="processing-queue-table">
            <TableHead>
              <TableRow>
                <TableCell>{t('pq_caseId')}</TableCell>
                <TableCell>{t('pq_patient')}</TableCell>
                <TableCell>{t('pq_clinician')}</TableCell>
                <TableCell>{t('pq_registered')}</TableCell>
                <TableCell>{t('pq_type')}</TableCell>
                <TableCell>{t('pq_specimens')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order.orderId}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/processing/${order.orderId}`)}
                  data-testid={`queue-row-${order.orderId}`}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {formatOrderIdDisplay(order.orderId)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {order.patient.lastName}, {order.patient.firstName}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {order.patient.patientId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {order.doctor.lastName}, {order.doctor.firstName}
                  </TableCell>
                  <TableCell>{new Date(order.registeredDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {order.caseType && <Chip label={tCaseType(order.caseType)} size="small" />}
                  </TableCell>
                  <TableCell>{order.specimens.length}</TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t('pq_noCases')}</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1}>
          <Typography variant="caption" color="text.secondary">
            {data?.total ?? 0} {t('cases')}
          </Typography>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            size="small"
          />
        </Box>
      </Paper>
    </Box>
  );
}
