import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ancillaryApi } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import {
  ANCILLARY_CATEGORIES,
  ANCILLARY_ORDER_STATUSES,
  type AncillaryCategory,
  type AncillaryOrderStatus,
} from '@lis/shared';
import { formatOrderIdDisplay, formatMaterialIdDisplay } from '@lis/shared';
import type { AncillaryOrder } from '@lis/shared';

const STATUS_COLORS: Record<AncillaryOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  COMPLETE: 'success',
  CANCELLED: 'error',
};

export default function AncillaryQueuePage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<AncillaryOrderStatus[]>(['PENDING', 'IN_PROGRESS']);
  const [categoryFilter, setCategoryFilter] = useState<AncillaryCategory | ''>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['ancillary-queue', statusFilter, categoryFilter],
    queryFn: () =>
      ancillaryApi.getQueue({
        statuses: statusFilter.length ? statusFilter : undefined,
        category: categoryFilter || undefined,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AncillaryOrderStatus }) =>
      ancillaryApi.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ancillary-queue'] });
      setActionSuccess(t('anc_statusUpdated'));
    },
    onError: (err: unknown) => {
      setActionError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
    },
  });

  // Group orders by orderId
  const grouped = orders.reduce<Record<string, AncillaryOrder[]>>((acc, order) => {
    const key = order.orderId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  const categoryLabel = (cat: AncillaryCategory) => t(`anc_cat_${cat}` as Parameters<typeof t>[0]);
  const statusLabel = (s: AncillaryOrderStatus) => t(`anc_status_${s}` as Parameters<typeof t>[0]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {t('nav_ancillary')}
      </Typography>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {actionSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
          <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
            {t('anc_status')}:
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={statusFilter}
            onChange={(_, newVal: AncillaryOrderStatus[]) => setStatusFilter(newVal)}
          >
            {ANCILLARY_ORDER_STATUSES.map((s) => (
              <ToggleButton key={s} value={s}>
                {statusLabel(s)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('anc_category')}</InputLabel>
            <Select
              value={categoryFilter}
              label={t('anc_category')}
              onChange={(e) => setCategoryFilter(e.target.value as AncillaryCategory | '')}
            >
              <MenuItem value="">All</MenuItem>
              {ANCILLARY_CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {isLoading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      ) : Object.keys(grouped).length === 0 ? (
        <Typography color="text.secondary">{t('anc_noOrders')}</Typography>
      ) : (
        Object.entries(grouped).map(([orderId, caseOrders]) => {
          const firstOrder = caseOrders[0];
          // Orders come back with orderable and possibly patient data from service
          const patientName = (firstOrder as unknown as { order?: { patient?: { lastName: string; firstName: string } } })
            ?.order?.patient
            ? `${(firstOrder as unknown as { order?: { patient?: { lastName: string; firstName: string } } }).order!.patient!.lastName}, ${(firstOrder as unknown as { order?: { patient?: { lastName: string; firstName: string } } }).order!.patient!.firstName}`
            : '';

          return (
            <Accordion key={orderId} defaultExpanded sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={formatOrderIdDisplay(orderId)}
                    color="primary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/result/${orderId}`);
                    }}
                    sx={{ cursor: 'pointer' }}
                  />
                  {patientName && (
                    <Typography variant="body2" fontWeight={600}>
                      {patientName}
                    </Typography>
                  )}
                  <Chip label={`${caseOrders.length}`} size="small" variant="outlined" />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('anc_blockLabel')}</TableCell>
                      <TableCell>Test</TableCell>
                      <TableCell>{t('anc_category')}</TableCell>
                      <TableCell>{t('anc_status')}</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {caseOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Chip
                            label={formatMaterialIdDisplay(order.blockId)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {order.orderable?.name ?? `#${order.orderableId}`}
                            {order.levelCount ? ` ×${order.levelCount}` : ''}
                          </Typography>
                          {order.notes && (
                            <Typography variant="caption" color="text.secondary">
                              {order.notes}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={order.orderable ? categoryLabel(order.orderable.category) : '—'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={statusLabel(order.status)}
                            color={STATUS_COLORS[order.status]}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            {order.status === 'PENDING' && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  updateMutation.mutate({ id: order.id, status: 'IN_PROGRESS' })
                                }
                                disabled={updateMutation.isPending}
                              >
                                {t('anc_markInProgress')}
                              </Button>
                            )}
                            {order.status === 'IN_PROGRESS' && (
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                onClick={() =>
                                  updateMutation.mutate({ id: order.id, status: 'COMPLETE' })
                                }
                                disabled={updateMutation.isPending}
                              >
                                {t('anc_markComplete')}
                              </Button>
                            )}
                            {(order.status === 'PENDING' || order.status === 'IN_PROGRESS') && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() =>
                                  updateMutation.mutate({ id: order.id, status: 'CANCELLED' })
                                }
                                disabled={updateMutation.isPending}
                              >
                                {t('anc_cancel')}
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
}
