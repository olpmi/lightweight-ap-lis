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
  Tabs,
  Tab,
  Collapse,
  Pagination,
  TextField,
  InputAdornment,
  Tooltip,
  IconButton,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowRight, Search, Delete } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ancillaryApi, blockApi, orderApi } from '../api';
import type { HistologyQueueOrder } from '../api';
import { qk } from '../api/queryKeys';
import { useLanguage } from '../hooks/useLanguage';
import { type AncillaryOrderStatus, type AncillaryOrder, type AncillaryCategory } from '@lis/shared';
import { formatOrderIdDisplay, formatMaterialIdDisplay } from '@lis/shared';

// ─── Ancillary case table: one accordion per case, inline status management ──

const NEXT_STATUS: Partial<Record<AncillaryOrderStatus, AncillaryOrderStatus>> = {
  PULL_BLOCK: 'MICROTOMY',
  MICROTOMY: 'SLIDE_STAIN',
  SLIDE_STAIN: 'DISTRIBUTED',
};

const NEXT_LABEL_KEY: Partial<Record<AncillaryOrderStatus, 'anc_markMicrotomy' | 'anc_markSlideStain' | 'anc_markDistributed'>> = {
  PULL_BLOCK: 'anc_markMicrotomy',
  MICROTOMY: 'anc_markSlideStain',
  SLIDE_STAIN: 'anc_markDistributed',
};

const HIST_STATUS_COLORS: Record<AncillaryOrderStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  PULL_BLOCK: 'warning',
  MICROTOMY: 'info',
  SLIDE_STAIN: 'default',
  DISTRIBUTED: 'success',
  CANCELLED: 'error',
  PULL_MATERIAL: 'default',
  MATERIAL_SENT: 'default',
  MATERIAL_RETURNED: 'default',
};

// Natural alphanumeric compare so SU-26-100-A2 < SU-26-100-A10 and A1 < A2 < A3.
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// ─── Per-group rows rendered inside a shared table ───────────────────────────

type TFn = ReturnType<typeof useLanguage>['t'];

interface HistGroupRowsProps {
  orderId: string;
  caseOrders: AncillaryOrder[];
  statusFilter: AncillaryOrderStatus;
  category: AncillaryCategory;
  updateMutation: { mutate: (args: { id: number; status: AncillaryOrderStatus }) => void; isPending: boolean };
  createSlidesMutation: { mutate: (args: { blockId: string; count: number }) => void; mutateAsync: (args: { blockId: string; count: number }) => Promise<unknown>; isPending: boolean };
  discardSlideMutation: { mutate: (args: { blockId: string; slideId: string }) => void };
  slideCounts: Record<string, number>;
  setSlideCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  bulkAddSlides: (orders: AncillaryOrder[]) => void;
  bulkAdvance: (orders: AncillaryOrder[]) => void;
  bulkCancel: (orders: AncillaryOrder[]) => void;
  bulkNextLabel: (orders: AncillaryOrder[]) => string;
  bulkPending: boolean;
  canAdvance: (o: AncillaryOrder) => boolean;
  fmtDateTime: (iso: string | null | undefined) => string | null;
  statusTimestamp: (order: AncillaryOrder) => string | null | undefined;
  t: TFn;
}

function HistGroupRowsImpl({
  orderId,
  caseOrders,
  statusFilter,
  category,
  updateMutation,
  createSlidesMutation,
  discardSlideMutation,
  slideCounts,
  setSlideCounts,
  bulkAddSlides,
  bulkAdvance,
  bulkCancel,
  bulkNextLabel,
  bulkPending,
  fmtDateTime,
  statusTimestamp,
  t,
}: HistGroupRowsProps) {
  const [open, setOpen] = useState(false);
  // Sort blocks alphanumerically (A1 < A2 < A3 < A10) within the case group.
  const sortedCaseOrders = useMemo(
    () => [...caseOrders].sort((a, b) => naturalCompare(a.blockId, b.blockId)),
    [caseOrders],
  );
  caseOrders = sortedCaseOrders;
  const firstOrder = caseOrders[0] as unknown as { order?: { patient?: { lastName: string; firstName: string } } };
  const patient = firstOrder?.order?.patient;
  const patientName = patient ? `${patient.lastName}, ${patient.firstName}` : '';
  const active = caseOrders.filter((o) => o.status === 'PULL_BLOCK' || o.status === 'MICROTOMY' || o.status === 'SLIDE_STAIN');

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
            <Chip label={formatOrderIdDisplay(orderId)} color="primary" size="small" sx={{ cursor: 'pointer' }} />
            {patientName && <Typography variant="body2" fontWeight={600}>{patientName}</Typography>}
            <Chip label={`${caseOrders.length}`} size="small" variant="outlined" />
          </Stack>
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell align="right" sx={{ py: 0.5 }} onClick={(e) => e.stopPropagation()}>
          {active.length > 0 && (
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {statusFilter === 'MICROTOMY' && (
                <Button size="small" variant="outlined" disabled={bulkPending || createSlidesMutation.isPending}
                  onClick={() => bulkAddSlides(caseOrders)}>
                  {t('anc_addSlidesToAll')}
                </Button>
              )}
              <Button size="small" variant="outlined" disabled={bulkPending || updateMutation.isPending}
                onClick={() => bulkAdvance(caseOrders)}>
                {bulkNextLabel(caseOrders)}
              </Button>
            </Stack>
          )}
        </TableCell>
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
            <Chip
              label={t(`anc_status_${order.status}` as Parameters<typeof t>[0])}
              color={HIST_STATUS_COLORS[order.status]}
              size="small"
            />
            <Typography variant="caption" display="block" color="text.secondary" mt={0.25}>
              {fmtDateTime(statusTimestamp(order))}
            </Typography>
          </TableCell>
          {statusFilter === 'MICROTOMY' ? (
            <TableCell>
              <Stack direction="column" spacing={0.5}>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={order.block?._count?.slides ?? 0}
                    size="small"
                    color={(order.block?._count?.slides ?? 0) > 0 ? 'success' : 'default'}
                    variant={(order.block?._count?.slides ?? 0) > 0 ? 'filled' : 'outlined'}
                  />
                  {order.block?.slides?.map((sl) => (
                    <Chip
                      key={sl.slideId}
                      label={formatMaterialIdDisplay(sl.slideId)}
                      size="small"
                      variant="outlined"
                      sx={sl.discarded ? { opacity: 0.55 } : undefined}
                      onDelete={sl.discarded ? undefined : () =>
                        discardSlideMutation.mutate({ blockId: order.blockId, slideId: sl.slideId })}
                      deleteIcon={<Tooltip title={t('hc_discardSlideTooltip')}><Delete fontSize="small" /></Tooltip>}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField
                    type="number"
                    size="small"
                    value={slideCounts[order.blockId] ?? (order.levelCount ?? 1)}
                    onChange={(e) => setSlideCounts((prev) => ({ ...prev, [order.blockId]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    sx={{ width: 65 }}
                    inputProps={{ min: 1, max: 50 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => createSlidesMutation.mutate({ blockId: order.blockId, count: slideCounts[order.blockId] ?? (order.levelCount ?? 1) })}
                    disabled={createSlidesMutation.isPending}
                  >
                    {t('pc_addSlidesBtn')}
                  </Button>
                </Stack>
              </Stack>
            </TableCell>
          ) : (
            <TableCell>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
                <Chip
                  label={order.block?._count?.slides ?? 0}
                  size="small"
                  color={(order.block?._count?.slides ?? 0) > 0 ? 'success' : 'default'}
                  variant={(order.block?._count?.slides ?? 0) > 0 ? 'filled' : 'outlined'}
                />
                {order.block?.slides?.map((sl) => (
                  <Chip key={sl.slideId} label={formatMaterialIdDisplay(sl.slideId)} size="small" variant="outlined"
                    sx={sl.discarded ? { opacity: 0.55 } : undefined} />
                ))}
              </Stack>
            </TableCell>
          )}
          <TableCell align="right">
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {order.status === 'PULL_BLOCK' && category !== 'HE' && (
                <Button size="small" variant="outlined"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'MICROTOMY' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_markMicrotomy')}
                </Button>
              )}
              {order.status === 'MICROTOMY' && (
                <Button size="small" variant="outlined" color="info"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'SLIDE_STAIN' })}
                  disabled={updateMutation.isPending || (order.block?._count?.slides ?? 0) === 0}>
                  {t('anc_markSlideStain')}
                </Button>
              )}
              {order.status === 'SLIDE_STAIN' && (
                <Button size="small" variant="contained" color="success"
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'DISTRIBUTED' })}
                  disabled={updateMutation.isPending}>
                  {t('anc_markDistributed')}
                </Button>
              )}
              {(order.status === 'DISTRIBUTED' || order.status === 'CANCELLED') && (
                <Button size="small" variant="outlined"
                  onClick={() => updateMutation.mutate({ id: order.id, status: category === 'HE' ? 'MICROTOMY' : 'PULL_BLOCK' })}
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

// Memoize so typing into one group's slide-count input or a single-row mutation
// doesn't re-render every other case group on the page. We compare the props
// that actually drive this group's render and skip slideCounts/setSlideCounts
// identity changes when none of this group's blockIds are affected.
const HistGroupRows = React.memo(HistGroupRowsImpl, (prev, next) => {
  if (
    prev.orderId !== next.orderId ||
    prev.caseOrders !== next.caseOrders ||
    prev.statusFilter !== next.statusFilter ||
    prev.category !== next.category ||
    prev.updateMutation.isPending !== next.updateMutation.isPending ||
    prev.createSlidesMutation.isPending !== next.createSlidesMutation.isPending ||
    prev.bulkPending !== next.bulkPending ||
    prev.t !== next.t
  ) {
    return false;
  }
  // Re-render only if a slideCount for one of this group's blocks changed.
  for (const o of next.caseOrders) {
    if (prev.slideCounts[o.blockId] !== next.slideCounts[o.blockId]) return false;
  }
  return true;
});

// ─── Main worklist table ──────────────────────────────────────────────────────

function AncillaryCaseTable({ category }: { category: AncillaryCategory }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<AncillaryOrderStatus>(
    category === 'HE' ? 'MICROTOMY' : 'PULL_BLOCK'
  );
  const [since, setSince] = useState<'1d' | '7d' | '30d' | ''>('7d');
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const showRecencyFilter = statusFilter === 'DISTRIBUTED' || statusFilter === 'CANCELLED';

  const sinceDate = useMemo(() => {
    if (!since || !showRecencyFilter) return undefined;
    const d = new Date();
    if (since === '1d') d.setDate(d.getDate() - 1);
    else if (since === '7d') d.setDate(d.getDate() - 7);
    else if (since === '30d') d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [since, showRecencyFilter]);

  const { data: result, isLoading } = useQuery({
    queryKey: qk.ancillaryQueue.byFilters(statusFilter, category, sinceDate, page),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const [slideCounts, setSlideCounts] = useState<Record<string, number>>({});

  // Retry once on 409 CONFLICT (backend throws when concurrent slide-creation
  // transactions race on the same block under Serializable isolation). Both
  // attempts opt out of the global ConflictToast since the retry resolves the
  // collision transparently for an idempotent retry-after-collision.
  const createSlidesWithRetry = async (blockId: string, count: number) => {
    try {
      return await blockApi.createSlides(blockId, count, 'H&E', { silentConflict: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        return await blockApi.createSlides(blockId, count, 'H&E', { silentConflict: true });
      }
      throw err;
    }
  };

  const createSlidesMutation = useMutation({
    mutationFn: ({ blockId, count }: { blockId: string; count: number }) =>
      createSlidesWithRetry(blockId, count),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const discardSlideMutation = useMutation({
    mutationFn: ({ blockId, slideId }: { blockId: string; slideId: string }) =>
      blockApi.discardSlide(blockId, slideId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const [bulkPending, setBulkPending] = useState(false);

  // Run sequentially so concurrent Serializable transactions on different
  // blocks don't race on shared lookups (intermittent 409s previously caused
  // "only added to a subset"). Single invalidation at the end avoids 4 mid-
  // flight refetches that re-rendered every row's buttons.
  const bulkAddSlides = async (caseOrders: AncillaryOrder[]) => {
    const targets = caseOrders.filter((o) => o.status === 'MICROTOMY');
    if (targets.length === 0) return;
    // Deduplicate by blockId so a panel with N tests on the same block
    // only creates 1 slide per block, not N.
    const seen = new Set<string>();
    const deduped = targets.filter((o) => {
      if (seen.has(o.blockId)) return false;
      seen.add(o.blockId);
      return true;
    });
    setBulkPending(true);
    let failures = 0;
    try {
      for (const o of deduped) {
        const count = slideCounts[o.blockId] ?? (o.levelCount ?? 1);
        try {
          await createSlidesWithRetry(o.blockId, count);
        } catch {
          failures++;
        }
      }
    } finally {
      setBulkPending(false);
      qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all });
      if (failures > 0) setActionError(t('errorGeneric'));
    }
  };

  const canAdvance = (o: AncillaryOrder) => {
    if (!NEXT_STATUS[o.status]) return false;
    if (category === 'HE' && o.status === 'PULL_BLOCK') return false;
    if (o.status === 'MICROTOMY' && (o.block?._count?.slides ?? 0) === 0) return false;
    return true;
  };

  const bulkAdvance = async (caseOrders: AncillaryOrder[]) => {
    const actionable = caseOrders.filter(canAdvance);
    if (actionable.length === 0) return;
    setBulkPending(true);
    let failures = 0;
    try {
      for (const o of actionable) {
        try {
          await ancillaryApi.updateStatus(o.id, { status: NEXT_STATUS[o.status]! });
        } catch {
          failures++;
        }
      }
    } finally {
      setBulkPending(false);
      qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all });
      if (failures > 0) setActionError(t('errorGeneric'));
    }
  };

  const bulkCancel = async (caseOrders: AncillaryOrder[]) => {
    const actionable = caseOrders.filter((o) => o.status === 'PULL_BLOCK' || o.status === 'MICROTOMY' || o.status === 'SLIDE_STAIN');
    if (actionable.length === 0) return;
    setBulkPending(true);
    let failures = 0;
    try {
      for (const o of actionable) {
        try {
          await ancillaryApi.updateStatus(o.id, { status: 'CANCELLED' });
        } catch {
          failures++;
        }
      }
    } finally {
      setBulkPending(false);
      qc.invalidateQueries({ queryKey: qk.ancillaryQueue.all });
      if (failures > 0) setActionError(t('errorGeneric'));
    }
  };

  const bulkNextLabel = (caseOrders: AncillaryOrder[]): string => {
    const actionable = caseOrders.filter(canAdvance);
    const activeStatuses = [...new Set(actionable.map((o) => o.status))];
    if (activeStatuses.length === 1) return t(NEXT_LABEL_KEY[activeStatuses[0]]!);
    return t('anc_advanceAll');
  };

  const grouped = useMemo(
    () =>
      orders.reduce<Record<string, AncillaryOrder[]>>((acc, order) => {
        const key = order.orderId;
        if (!acc[key]) acc[key] = [];
        acc[key].push(order);
        return acc;
      }, {}),
    [orders],
  );

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

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusTimestamp = (order: AncillaryOrder) => {
    switch (order.status) {
      case 'MICROTOMY': return order.inProgressAt ?? order.orderedAt;
      case 'DISTRIBUTED': return order.completedAt;
      case 'CANCELLED': return order.cancelledAt;
      default: return order.orderedAt;
    }
  };

  return (
    <>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>{actionError}</Alert>
      )}
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
          <Typography variant="body2" fontWeight={600}>
            {t('anc_status')}:
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={(_, newVal: AncillaryOrderStatus | null) => { if (newVal) { setStatusFilter(newVal); setPage(1); } }}
          >
            {(['PULL_BLOCK', 'MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED', 'CANCELLED'] as AncillaryOrderStatus[])
              .filter((s) => !(category === 'HE' && s === 'PULL_BLOCK'))
              .map((s) => (
              <ToggleButton key={s} value={s}>
                {t(`anc_status_${s}` as Parameters<typeof t>[0])}
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
        <Box display="flex" justifyContent="center" mt={2}>
          <CircularProgress />
        </Box>
      ) : filteredEntries.length === 0 ? (
        <Typography color="text.secondary">{t('anc_noOrders')}</Typography>
      ) : (
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '27%' }} />
            <col />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>{t('anc_blockLabel')}</TableCell>
              <TableCell>{t('test')}</TableCell>
              <TableCell>{t('anc_status')}</TableCell>
              <TableCell>{t('pc_slides')}</TableCell>
              <TableCell align="right">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEntries.map(([orderId, caseOrders]) => (
              <HistGroupRows
                key={orderId}
                orderId={orderId}
                caseOrders={caseOrders}
                statusFilter={statusFilter}
                category={category}
                updateMutation={updateMutation}
                createSlidesMutation={createSlidesMutation}
                discardSlideMutation={discardSlideMutation}
                slideCounts={slideCounts}
                setSlideCounts={setSlideCounts}
                bulkAddSlides={bulkAddSlides}
                bulkAdvance={bulkAdvance}
                bulkCancel={bulkCancel}
                bulkNextLabel={bulkNextLabel}
                bulkPending={bulkPending}
                canAdvance={canAdvance}
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
    </>
  );
}

// ─── H&E worklist (block-creation driven, slide-status driven) ───────────────

type HEStatus = 'MICROTOMY' | 'SLIDE_STAIN' | 'DISTRIBUTED' | 'CANCELLED';

interface HECaseRowsProps {
  order: HistologyQueueOrder;
  statusFilter: HEStatus;
  slideCounts: Record<string, number>;
  setSlideCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  createSlidesMutation: { mutate: (args: { blockId: string; count: number }) => void; mutateAsync: (args: { blockId: string; count: number }) => Promise<unknown>; isPending: boolean };
  updateHeStatusMutation: { mutate: (args: { blockId: string; status: HEStatus }) => void; isPending: boolean };
  navigate: ReturnType<typeof useNavigate>;
  t: TFn;
}

function HECaseRowsImpl({
  order,
  statusFilter,
  slideCounts,
  setSlideCounts,
  createSlidesMutation,
  updateHeStatusMutation,
  navigate,
  t,
}: HECaseRowsProps) {
  const { tSite, tOrgan, tSpecimenType } = useLanguage();
  const localizeBodySiteName = (name: string) => {
    const organ = tOrgan(name);
    if (organ !== name) return organ;
    return tSite(name);
  };
  const [open, setOpen] = useState(false);
  const caseBlocks = order.specimens.flatMap((spec) =>
    spec.blocks.map((block) => ({ block, spec })),
  );
  const patientName = `${order.patient.lastName}, ${order.patient.firstName}`;

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const bulkCut = async () => {
    for (const { block } of caseBlocks) {
      try {
        await createSlidesMutation.mutateAsync({ blockId: block.blockId, count: slideCounts[block.blockId] ?? 1 });
      } catch { /* individual failures handled by onError */ }
    }
  };

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
              label={formatOrderIdDisplay(order.orderId)}
              color="primary"
              size="small"
              sx={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); navigate(`/processing/${order.orderId}`); }}
            />
            <Typography variant="body2" fontWeight={600}>{patientName}</Typography>
            <Chip label={`${caseBlocks.length}`} size="small" variant="outlined" />
          </Stack>
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell align="right" sx={{ py: 0.5 }} onClick={(e) => e.stopPropagation()}>
          {caseBlocks.length > 0 && (
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {statusFilter === 'MICROTOMY' && (
                <>
                  <Button size="small" variant="outlined" disabled={createSlidesMutation.isPending}
                    onClick={bulkCut}>
                    {t('anc_addSlidesToAll')}
                  </Button>
                  <Button size="small" variant="outlined" color="info" disabled={updateHeStatusMutation.isPending}
                    onClick={() => caseBlocks.forEach(({ block }) =>
                      updateHeStatusMutation.mutate({ blockId: block.blockId, status: 'SLIDE_STAIN' }))}>
                    {t('anc_markSlideStain')}
                  </Button>
                </>
              )}
              {statusFilter === 'SLIDE_STAIN' && (
                <Button size="small" variant="outlined" disabled={updateHeStatusMutation.isPending}
                  onClick={() => caseBlocks.forEach(({ block }) =>
                    updateHeStatusMutation.mutate({ blockId: block.blockId, status: 'DISTRIBUTED' }))}>
                  {t('anc_markDistributed')}
                </Button>
              )}
            </Stack>
          )}
        </TableCell>
      </TableRow>

      {/* Detail rows */}
      {caseBlocks.map(({ block, spec }) => (
        <TableRow key={block.blockId} sx={{ display: open ? undefined : 'none' }}>
          <TableCell />
          <TableCell>
            <Chip label={formatMaterialIdDisplay(block.blockId)} size="small" variant="outlined" />
          </TableCell>
          <TableCell>
            <Typography variant="body2">H&amp;E</Typography>
            <Typography variant="caption" color="text.secondary">
              {spec.bodySite ? localizeBodySiteName(spec.bodySite.bodySiteName) : ''}
              {spec.specimenType ? ` · ${tSpecimenType(spec.specimenType.specimenTypeName)}` : ''}
            </Typography>
          </TableCell>
          <TableCell>
            <Chip
              label={t(`anc_status_${block.heStatus}` as Parameters<typeof t>[0])}
              color={HIST_STATUS_COLORS[block.heStatus as AncillaryOrderStatus]}
              size="small"
            />
            <Typography variant="caption" display="block" color="text.secondary" mt={0.25}>
              {fmtDateTime(block.updatedAt ?? block.createdDatetime)}
            </Typography>
          </TableCell>
          {statusFilter === 'MICROTOMY' ? (
            <TableCell>
              <Stack direction="column" spacing={0.5}>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={block.slides.length}
                    size="small"
                    color={block.slides.length > 0 ? 'success' : 'default'}
                    variant={block.slides.length > 0 ? 'filled' : 'outlined'}
                  />
                  {block.slides.map((sl) => (
                    <Chip key={sl.slideId} label={formatMaterialIdDisplay(sl.slideId)} size="small" variant="outlined" />
                  ))}
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField
                    type="number" size="small"
                    value={slideCounts[block.blockId] ?? 1}
                    onChange={(e) => setSlideCounts((prev) => ({ ...prev, [block.blockId]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    sx={{ width: 65 }} inputProps={{ min: 1, max: 50 }}
                  />
                  <Button size="small" variant="outlined" disabled={createSlidesMutation.isPending}
                    onClick={() => createSlidesMutation.mutate({ blockId: block.blockId, count: slideCounts[block.blockId] ?? 1 })}>
                    {t('hq_cutSlides')}
                  </Button>
                </Stack>
              </Stack>
            </TableCell>
          ) : (
            <TableCell>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
                <Chip
                  label={block.slides.length}
                  size="small"
                  color={block.slides.length > 0 ? 'success' : 'default'}
                  variant={block.slides.length > 0 ? 'filled' : 'outlined'}
                />
                {block.slides.map((sl) => (
                  <Chip key={sl.slideId} label={formatMaterialIdDisplay(sl.slideId)} size="small" variant="outlined" />
                ))}
              </Stack>
            </TableCell>
          )}
          <TableCell align="right">
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {block.heStatus === 'MICROTOMY' && (
                <Button size="small" variant="outlined" color="info"
                  disabled={updateHeStatusMutation.isPending}
                  onClick={() => updateHeStatusMutation.mutate({ blockId: block.blockId, status: 'SLIDE_STAIN' })}>
                  {t('anc_markSlideStain')}
                </Button>
              )}
              {block.heStatus === 'SLIDE_STAIN' && (
                <Button size="small" variant="contained" color="success"
                  disabled={updateHeStatusMutation.isPending}
                  onClick={() => updateHeStatusMutation.mutate({ blockId: block.blockId, status: 'DISTRIBUTED' })}>
                  {t('anc_markDistributed')}
                </Button>
              )}
              {(block.heStatus === 'DISTRIBUTED' || block.heStatus === 'CANCELLED') && (
                <Button size="small" variant="outlined"
                  disabled={updateHeStatusMutation.isPending}
                  onClick={() => updateHeStatusMutation.mutate({ blockId: block.blockId, status: 'MICROTOMY' })}>
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

const HECaseRows = React.memo(HECaseRowsImpl, (prev, next) => {
  if (
    prev.order !== next.order ||
    prev.statusFilter !== next.statusFilter ||
    prev.createSlidesMutation.isPending !== next.createSlidesMutation.isPending ||
    prev.updateHeStatusMutation.isPending !== next.updateHeStatusMutation.isPending ||
    prev.t !== next.t
  ) {
    return false;
  }
  for (const spec of next.order.specimens) {
    for (const block of spec.blocks) {
      if (prev.slideCounts[block.blockId] !== next.slideCounts[block.blockId]) return false;
    }
  }
  return true;
});

function HEWorklist() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<HEStatus>('MICROTOMY');
  const [since, setSince] = useState<'1d' | '7d' | '30d' | ''>('7d');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [slideCounts, setSlideCounts] = useState<Record<string, number>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const showRecencyFilter = statusFilter === 'DISTRIBUTED' || statusFilter === 'CANCELLED';

  const sinceDate = useMemo(() => {
    if (!since || !showRecencyFilter) return undefined;
    const d = new Date();
    if (since === '1d') d.setDate(d.getDate() - 1);
    else if (since === '7d') d.setDate(d.getDate() - 7);
    else if (since === '30d') d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [since, showRecencyFilter]);

  const { data: result, isLoading } = useQuery({
    queryKey: qk.histologyQueue.byParams(page, debouncedSearch, statusFilter, sinceDate),
    queryFn: () => orderApi.histologyQueue(page, PAGE_SIZE, debouncedSearch, statusFilter, sinceDate),
    placeholderData: keepPreviousData,
  });

  const orders = (result?.data ?? []) as HistologyQueueOrder[];
  const totalPages = Math.ceil((result?.total ?? 0) / PAGE_SIZE);

  const createSlidesWithRetry = async (blockId: string, count: number) => {
    try {
      return await blockApi.createSlides(blockId, count, 'H&E', { silentConflict: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        return await blockApi.createSlides(blockId, count, 'H&E', { silentConflict: true });
      }
      throw err;
    }
  };

  const createSlidesMutation = useMutation({
    mutationFn: ({ blockId, count }: { blockId: string; count: number }) =>
      createSlidesWithRetry(blockId, count),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.histologyQueue.all }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const updateHeStatusMutation = useMutation({
    mutationFn: ({ blockId, status }: { blockId: string; status: HEStatus }) =>
      blockApi.updateHeStatus(blockId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.histologyQueue.all }),
    onError: () => setActionError(t('errorGeneric')),
  });

  return (
    <>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
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
          <Typography variant="body2" fontWeight={600}>{t('anc_status')}:</Typography>
          <ToggleButtonGroup
            size="small" exclusive
            value={statusFilter}
            onChange={(_, v: HEStatus | null) => { if (v) { setStatusFilter(v); setPage(1); } }}
          >
            {(['MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED', 'CANCELLED'] as HEStatus[]).map((s) => (
              <ToggleButton key={s} value={s}>
                {t(`anc_status_${s}` as Parameters<typeof t>[0])}
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
        <Box display="flex" justifyContent="center" mt={2}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <Typography color="text.secondary">{t('hq_noPendingCuts')}</Typography>
      ) : (
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '27%' }} />
            <col />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>{t('anc_blockLabel')}</TableCell>
              <TableCell>Test</TableCell>
              <TableCell>{t('anc_status')}</TableCell>
              <TableCell>{t('pc_slides')}</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <HECaseRows
                key={order.orderId}
                order={order}
                statusFilter={statusFilter}
                slideCounts={slideCounts}
                setSlideCounts={setSlideCounts}
                createSlidesMutation={createSlidesMutation}
                updateHeStatusMutation={updateHeStatusMutation}
                navigate={navigate}
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
    </>
  );
}


export default function HistologyQueuePage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'he' | 'he_levels' | 'ihc' | 'special_stain'>('he');

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {t('nav_histology')}
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="he" label={t('anc_cat_HE')} />
        <Tab value="he_levels" label={t('anc_cat_HE_LEVELS')} />
        <Tab value="ihc" label={t('anc_cat_IHC')} />
        <Tab value="special_stain" label={t('anc_cat_SPECIAL_STAIN')} />
      </Tabs>

      {activeTab === 'he' && <HEWorklist />}
      {activeTab === 'he_levels' && <AncillaryCaseTable category="HE_LEVELS" />}
      {activeTab === 'ihc' && <AncillaryCaseTable category="IHC" />}
      {activeTab === 'special_stain' && <AncillaryCaseTable category="SPECIAL_STAIN" />}
    </Box>
  );
}
