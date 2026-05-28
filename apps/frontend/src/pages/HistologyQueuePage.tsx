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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Pagination,
  TextField,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import { ExpandMore, Search, Delete } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ancillaryApi, blockApi } from '../api';
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ancillary-queue'] }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const [slideCounts, setSlideCounts] = useState<Record<string, number>>({});

  const createSlidesMutation = useMutation({
    mutationFn: ({ blockId, count }: { blockId: string; count: number }) =>
      blockApi.createSlides(blockId, count, 'H&E'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ancillary-queue'] }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const discardSlideMutation = useMutation({
    mutationFn: ({ blockId, slideId }: { blockId: string; slideId: string }) =>
      blockApi.discardSlide(blockId, slideId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ancillary-queue'] }),
    onError: () => setActionError(t('errorGeneric')),
  });

  const bulkAddSlides = (caseOrders: AncillaryOrder[]) => {
    const targets = caseOrders.filter((o) => o.status === 'MICROTOMY');
    Promise.all(
      targets.map((o) => createSlidesMutation.mutateAsync({ blockId: o.blockId, count: slideCounts[o.blockId] ?? (o.levelCount ?? 1) }))
    ).catch(() => setActionError(t('errorGeneric')));
  };

  const canAdvance = (o: AncillaryOrder) => {
    if (!NEXT_STATUS[o.status]) return false;
    if (category === 'HE' && o.status === 'PULL_BLOCK') return false;
    if (o.status === 'MICROTOMY' && (o.block?._count?.slides ?? 0) === 0) return false;
    return true;
  };

  const bulkAdvance = (caseOrders: AncillaryOrder[]) => {
    const actionable = caseOrders.filter(canAdvance);
    Promise.all(
      actionable.map((o) => updateMutation.mutateAsync({ id: o.id, status: NEXT_STATUS[o.status]! }))
    ).catch(() => setActionError(t('errorGeneric')));
  };

  const bulkCancel = (caseOrders: AncillaryOrder[]) => {
    const actionable = caseOrders.filter((o) => o.status === 'PULL_BLOCK' || o.status === 'MICROTOMY' || o.status === 'SLIDE_STAIN');
    Promise.all(
      actionable.map((o) => updateMutation.mutateAsync({ id: o.id, status: 'CANCELLED' }))
    ).catch(() => setActionError(t('errorGeneric')));
  };

  const bulkNextLabel = (caseOrders: AncillaryOrder[]): string => {
    const actionable = caseOrders.filter(canAdvance);
    const activeStatuses = [...new Set(actionable.map((o) => o.status))];
    if (activeStatuses.length === 1) return t(NEXT_LABEL_KEY[activeStatuses[0]]!);
    return t('anc_advanceAll');
  };

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
        filteredEntries.map(([orderId, caseOrders]) => {
          const firstOrder = caseOrders[0] as unknown as {
            order?: { patient?: { lastName: string; firstName: string }; caseType?: string };
          };
          const patient = firstOrder?.order?.patient;
          const patientName = patient ? `${patient.lastName}, ${patient.firstName}` : '';
          return (
            <Accordion key={orderId} sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ flex: 1, mr: 1 }}>
                  <Chip
                    label={formatOrderIdDisplay(orderId)}
                    color="primary"
                    size="small"
                    sx={{ cursor: 'default' }}
                  />
                  {patientName && (
                    <Typography variant="body2" fontWeight={600}>{patientName}</Typography>
                  )}
                  <Chip label={`${caseOrders.length}`} size="small" variant="outlined" />
                  {(() => {
                    const active = caseOrders.filter((o) => o.status === 'PULL_BLOCK' || o.status === 'MICROTOMY' || o.status === 'SLIDE_STAIN');
                    if (active.length === 0) return null;
                    return (
                      <Stack direction="row" spacing={0.5} sx={{ ml: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        {statusFilter === 'MICROTOMY' && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={createSlidesMutation.isPending}
                            onClick={() => bulkAddSlides(caseOrders)}
                          >
                            {t('anc_addSlidesToAll')}
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={updateMutation.isPending}
                          onClick={() => bulkAdvance(caseOrders)}
                        >
                          {bulkNextLabel(caseOrders)}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={updateMutation.isPending}
                          onClick={() => bulkCancel(caseOrders)}
                        >
                          {t('anc_cancelAll')}
                        </Button>
                      </Stack>
                    );
                  })()}
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '27%' }} />
                    <col style={{ width: '28%' }} />
                  </colgroup>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('anc_blockLabel')}</TableCell>
                      <TableCell>Test</TableCell>
                      <TableCell>{t('anc_status')}</TableCell>
                      <TableCell>{t('pc_slides')}</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {caseOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Chip label={formatMaterialIdDisplay(order.blockId)} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {order.orderable?.name ?? `#${order.orderableId}`}
                            {order.levelCount ? ` ×${order.levelCount}` : ''}
                          </Typography>
                          {order.notes && (
                            <Typography variant="caption" color="text.secondary">{order.notes}</Typography>
                          )}
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
                                      discardSlideMutation.mutate({ blockId: order.blockId, slideId: sl.slideId })
                                    }
                                    deleteIcon={
                                      <Tooltip title={t('hc_discardSlideTooltip')}>
                                        <Delete fontSize="small" />
                                      </Tooltip>
                                    }
                                  />
                                ))}
                              </Stack>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <TextField
                                  type="number"
                                  size="small"
                                  value={slideCounts[order.blockId] ?? (order.levelCount ?? 1)}
                                  onChange={(e) =>
                                    setSlideCounts((prev) => ({
                                      ...prev,
                                      [order.blockId]: Math.max(1, parseInt(e.target.value) || 1),
                                    }))
                                  }
                                  sx={{ width: 65 }}
                                  inputProps={{ min: 1, max: 50 }}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    createSlidesMutation.mutate({
                                      blockId: order.blockId,
                                      count: slideCounts[order.blockId] ?? (order.levelCount ?? 1),
                                    })
                                  }
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
                                <Chip
                                  key={sl.slideId}
                                  label={formatMaterialIdDisplay(sl.slideId)}
                                  size="small"
                                  variant="outlined"
                                  sx={sl.discarded ? { opacity: 0.55 } : undefined}
                                />
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
                            {(order.status === 'PULL_BLOCK' || order.status === 'MICROTOMY' || order.status === 'SLIDE_STAIN') && (
                              <Button size="small" variant="outlined" color="error"
                                onClick={() => updateMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                                disabled={updateMutation.isPending}>
                                {t('anc_cancel')}
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
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" />
        </Box>
      )}
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

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

      {activeTab === 'he' && <AncillaryCaseTable category="HE" />}
      {activeTab === 'he_levels' && <AncillaryCaseTable category="HE_LEVELS" />}
      {activeTab === 'ihc' && <AncillaryCaseTable category="IHC" />}
      {activeTab === 'special_stain' && <AncillaryCaseTable category="SPECIAL_STAIN" />}
    </Box>
  );
}
