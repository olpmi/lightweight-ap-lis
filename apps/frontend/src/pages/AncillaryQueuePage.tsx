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
  Pagination,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowRight, Search } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ancillaryApi } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import {
  SENDOUT_ORDER_STATUSES,
  type AncillaryCategory,
  type AncillaryOrderStatus,
} from '@lis/shared';
import { formatOrderIdDisplay, formatMaterialIdDisplay } from '@lis/shared';
import type { AncillaryOrder } from '@lis/shared';

const STATUS_COLORS: Record<AncillaryOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  PULL_BLOCK: 'default',
  MICROTOMY: 'default',
  SLIDE_STAIN: 'default',
  DISTRIBUTED: 'default',
  CANCELLED: 'error',
  PULL_MATERIAL: 'warning',
  MATERIAL_SENT: 'info',
  MATERIAL_RETURNED: 'success',
};

const PAGE_SIZE = 20;

// ─── Per-group rows rendered inside a shared table ───────────────────────────

type TFn = ReturnType<typeof useLanguage>['t'];

interface SendoutGroupRowsProps {
  orderId: string;
  caseOrders: AncillaryOrder[];
  updateMutation: { mutate: (args: { id: number; status: AncillaryOrderStatus }) => void; isPending: boolean };
  statusLabel: (s: AncillaryOrderStatus) => string;
  fmtDateTime: (iso: string | null | undefined) => string | null;
  statusTimestamp: (order: AncillaryOrder) => string | null | undefined;
  t: TFn;
}

function SendoutGroupRows({ orderId, caseOrders, updateMutation, statusLabel, fmtDateTime, statusTimestamp, t }: SendoutGroupRowsProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const firstOrder = caseOrders[0] as unknown as { order?: { patient?: { lastName: string; firstName: string } } };
  const patient = firstOrder?.order?.patient;
  const patientName = patient ? `${patient.lastName}, ${patient.firstName}` : '';

  return (
    <>
      {/* Group header row */}
      <TableRow
        sx={{ bgcolor: 'action.hover', cursor: 'pointer', '&:hover': { bgcolor: 'action.selected' } }}
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell sx={{ py: 0.5 }}>
          <IconButton size="small" tabIndex={-1}>
            {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell colSpan={2} sx={{ py: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={formatOrderIdDisplay(orderId)}
              color="primary"
              size="small"
              onClick={(e) => { e.stopPropagation(); navigate(`/result/${orderId}`); }}
              sx={{ cursor: 'pointer' }}
            />
            {patientName && <Typography variant="body2" fontWeight={600}>{patientName}</Typography>}
            <Chip label={`${caseOrders.length}`} size="small" variant="outlined" />
          </Stack>
        </TableCell>
        <TableCell />
        <TableCell />
      </TableRow>

      {/* Detail rows */}
      {caseOrders.map((order) => (
        <TableRow key={order.id} sx={{ display: open ? undefined : 'none' }}>
          <TableCell />
          <TableCell>
            <Chip label={formatMaterialIdDisplay(order.blockId)} size="small" variant="outlined" />
          </TableCell>
          <TableCell>
            <Typography variant="body2">
              {order.orderable?.name ?? `#${order.orderableId}`}
              {order.levelCount ? ` ×${order.levelCount}` : ''}
            </Typography>
            {order.notes && <Typography variant="caption" color="text.secondary">{order.notes}</Typography>}
          </TableCell>
          <TableCell>
            <Chip label={statusLabel(order.status)} color={STATUS_COLORS[order.status]} size="small" />
            <Typography variant="caption" display="block" color="text.secondary" mt={0.25}>
              {fmtDateTime(statusTimestamp(order))}
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {order.status === 'PULL_MATERIAL' && (
                <Button size="small" variant="outlined"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'MATERIAL_SENT' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_markMaterialSent')}
                </Button>
              )}
              {order.status === 'MATERIAL_SENT' && (
                <Button size="small" variant="contained" color="success"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'MATERIAL_RETURNED' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_markMaterialReturned')}
                </Button>
              )}
              {(order.status === 'PULL_MATERIAL' || order.status === 'MATERIAL_SENT') && (
                <Button size="small" variant="outlined" color="error"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_cancel')}
                </Button>
              )}
              {(order.status === 'MATERIAL_RETURNED' || order.status === 'CANCELLED') && (
                <Button size="small" variant="outlined"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'PULL_MATERIAL' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_reactivate')}
                </Button>
              )}
            </Stack>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main worklist table ──────────────────────────────────────────────────────

function SendoutCaseTable({ category }: { category: AncillaryCategory }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<AncillaryOrderStatus>('PULL_MATERIAL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [since, setSince] = useState<'1d' | '7d' | '30d' | ''>('7d');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const showRecencyFilter = statusFilter === 'MATERIAL_RETURNED' || statusFilter === 'CANCELLED';

  const sinceDate = useMemo(() => {
    if (!since || !showRecencyFilter) return undefined;
    const d = new Date();
    if (since === '1d') d.setDate(d.getDate() - 1);
    else if (since === '7d') d.setDate(d.getDate() - 7);
    else if (since === '30d') d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [since, showRecencyFilter]);

  const { data: result, isLoading } = useQuery({
    queryKey: ['ancillary-queue', statusFilter, category, sinceDate, page],
    queryFn: () =>
      ancillaryApi.getQueue({
        statuses: [statusFilter],
        category,
        since: sinceDate,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const orders = result?.data ?? [];
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_SIZE);

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

  const grouped = orders.reduce<Record<string, AncillaryOrder[]>>((acc, order) => {
    const key = order.orderId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  const filteredEntries = useMemo(() => {
    const entries = Object.entries(grouped);
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(([orderId, caseOrders]) => {
      if (formatOrderIdDisplay(orderId).toLowerCase().includes(q)) return true;
      if (orderId.toLowerCase().includes(q)) return true;
      const patient = (caseOrders[0] as unknown as { order?: { patient?: { lastName: string; firstName: string } } })?.order?.patient;
      if (!patient) return false;
      return patient.lastName.toLowerCase().includes(q) || patient.firstName.toLowerCase().includes(q);
    });
  }, [grouped, search]);

  const statusLabel = (s: AncillaryOrderStatus) => t(`anc_status_${s}` as Parameters<typeof t>[0]);

  const statusTimestamp = (order: AncillaryOrder) => {
    switch (order.status) {
      case 'MATERIAL_SENT': return order.inProgressAt ?? order.orderedAt;
      case 'MATERIAL_RETURNED': return order.completedAt;
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
          <TextField
            size="small"
            placeholder={t('anc_searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ width: 280 }}
          />
          <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
            {t('anc_status')}:
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={(_, newVal: AncillaryOrderStatus | null) => { if (newVal) { setStatusFilter(newVal); setPage(1); } }}
          >
            {SENDOUT_ORDER_STATUSES.map((s) => (
              <ToggleButton key={s} value={s}>
                {statusLabel(s)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {showRecencyFilter && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('anc_since')}</InputLabel>
              <Select
                value={since}
                label={t('anc_since')}
                onChange={(e) => { setSince(e.target.value as '1d' | '7d' | '30d' | ''); setPage(1); }}
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
      ) : filteredEntries.length === 0 ? (
        <Typography color="text.secondary">{t('anc_noOrders')}</Typography>
      ) : (
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '35%' }} />
            <col style={{ width: '20%' }} />
            <col />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>{t('anc_blockLabel')}</TableCell>
              <TableCell>Test</TableCell>
              <TableCell>{t('anc_status')}</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEntries.map(([orderId, caseOrders]) => (
              <SendoutGroupRows
                key={orderId}
                orderId={orderId}
                caseOrders={caseOrders}
                updateMutation={updateMutation}
                statusLabel={statusLabel}
                fmtDateTime={fmtDateTime}
                statusTimestamp={statusTimestamp}
                t={t}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" />
        </Box>
      )}
    </Box>
  );
}

export default function AncillaryQueuePage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {t('nav_ancillary')}
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={t('anc_cat_SEND_OUT')} />
        <Tab label={t('anc_cat_MOLECULAR')} />
      </Tabs>
      {tab === 0 && <SendoutCaseTable category="SEND_OUT" />}
      {tab === 1 && <SendoutCaseTable category="MOLECULAR" />}
    </Box>
  );
}
