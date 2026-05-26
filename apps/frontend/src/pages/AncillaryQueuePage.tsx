import React, { useState, useMemo } from 'react';
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
  const [since, setSince] = useState<'1d' | '7d' | '30d' | ''>('7d');

  const showRecencyFilter = statusFilter.some((s) => s === 'COMPLETE' || s === 'CANCELLED');

  const sinceDate = useMemo(() => {
    if (!since || !showRecencyFilter) return undefined;
    const d = new Date();
    if (since === '1d') d.setDate(d.getDate() - 1);
    else if (since === '7d') d.setDate(d.getDate() - 7);
    else if (since === '30d') d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [since, showRecencyFilter]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['ancillary-queue', statusFilter, categoryFilter, sinceDate],
    queryFn: () =>
      ancillaryApi.getQueue({
        statuses: statusFilter.length ? statusFilter : undefined,
        category: categoryFilter || undefined,
        since: sinceDate,
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

  const statusTimestamp = (order: AncillaryOrder) => {
    switch (order.status) {
      case 'IN_PROGRESS': return order.inProgressAt ?? order.orderedAt;
      case 'COMPLETE': return order.completedAt;
      case 'CANCELLED': return order.cancelledAt;
      default: return order.orderedAt;
    }
  };

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

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

          {showRecencyFilter && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('anc_since')}</InputLabel>
              <Select
                value={since}
                label={t('anc_since')}
                onChange={(e) => setSince(e.target.value as '1d' | '7d' | '30d' | '')}
              >
                <MenuItem value="1d">{t('anc_since_1d')}</MenuItem>
                <MenuItem value="7d">{t('anc_since_7d')}</MenuItem>
                <MenuItem value="30d">{t('anc_since_30d')}</MenuItem>
                <MenuItem value="">{t('anc_since_all')}</MenuItem>
              </Select>
            </FormControl>
          )}
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
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '27%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '24%' }} />
                  </colgroup>
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
                          <Typography variant="caption" display="block" color="text.secondary" mt={0.25}>
                            {fmtDateTime(statusTimestamp(order))}
                          </Typography>
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
                            {(order.status === 'COMPLETE' || order.status === 'CANCELLED') && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  updateMutation.mutate({ id: order.id, status: 'PENDING' })
                                }
                                disabled={updateMutation.isPending}
                              >
                                {t('anc_reactivate')}
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
