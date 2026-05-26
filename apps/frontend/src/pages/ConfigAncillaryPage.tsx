import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  Paper,
  Tabs,
  Tab,
  Checkbox,
} from '@mui/material';
import { Edit, Delete, Add } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ancillaryApi } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import ConfigLayout from '../components/layout/ConfigLayout';
import {
  ANCILLARY_CATEGORIES,
  type AncillaryCategory,
} from '@lis/shared';
import type {
  AncillaryOrderable,
  AncillaryPanel,
} from '@lis/shared';

type SectionTab = 'tests' | 'panels';

// ── Orderable dialog ──────────────────────────────────────────────────────────

interface OrderableDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: AncillaryOrderable | null;
  onSave: (data: { name: string; category: AncillaryCategory; sortOrder?: number; isActive?: boolean }) => void;
  saving: boolean;
  error: string | null;
}

function OrderableDialog({ open, onClose, initial, onSave, saving, error }: OrderableDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<AncillaryCategory>(initial?.category ?? 'IHC');
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setCategory(initial?.category ?? 'IHC');
      setSortOrder(initial?.sortOrder ?? 0);
      setIsActive(initial?.isActive ?? true);
    }
  }, [open, initial]);

  const categoryLabel = (cat: AncillaryCategory) => t(`anc_cat_${cat}` as Parameters<typeof t>[0]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial ? t('anc_editTest') : t('anc_addTest')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
          />
          <FormControl fullWidth size="small">
            <InputLabel>{t('anc_category')}</InputLabel>
            <Select
              value={category}
              label={t('anc_category')}
              onChange={(e) => setCategory(e.target.value as AncillaryCategory)}
            >
              {ANCILLARY_CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            size="small"
            sx={{ width: 140 }}
          />
          {initial && (
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              }
              label="Active"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('anc_cancel')}</Button>
        <Button
          variant="contained"
          onClick={() => onSave({ name, category, sortOrder, isActive })}
          disabled={saving || !name.trim()}
        >
          {saving ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Panel dialog ──────────────────────────────────────────────────────────────

interface PanelDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: AncillaryPanel | null;
  orderables: AncillaryOrderable[];
  onSave: (data: {
    name: string;
    category: AncillaryCategory;
    orderableIds: number[];
    sortOrder?: number;
    isActive?: boolean;
  }) => void;
  saving: boolean;
  error: string | null;
}

function PanelDialog({ open, onClose, initial, orderables, onSave, saving, error }: PanelDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<AncillaryCategory>(initial?.category ?? 'IHC');
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set((initial?.items ?? []).map((i) => i.orderableId)),
  );

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setCategory(initial?.category ?? 'IHC');
      setSortOrder(initial?.sortOrder ?? 0);
      setIsActive(initial?.isActive ?? true);
      setSelectedIds(new Set((initial?.items ?? []).map((i) => i.orderableId)));
    }
  }, [open, initial]);

  const categoryOrderables = orderables.filter((o) => o.category === category && o.isActive);
  const categoryLabel = (cat: AncillaryCategory) => t(`anc_cat_${cat}` as Parameters<typeof t>[0]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? t('anc_editPanel') : t('anc_addPanel')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
          />
          <FormControl fullWidth size="small">
            <InputLabel>{t('anc_category')}</InputLabel>
            <Select
              value={category}
              label={t('anc_category')}
              onChange={(e) => {
                setCategory(e.target.value as AncillaryCategory);
                setSelectedIds(new Set());
              }}
            >
              {ANCILLARY_CATEGORIES.filter((c) => c === 'IHC' || c === 'MOLECULAR').map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            size="small"
            sx={{ width: 140 }}
          />

          <Typography variant="body2" fontWeight={600}>{t('anc_tests')}</Typography>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {categoryOrderables.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t('anc_noOrders')}</Typography>
            ) : (
              categoryOrderables.map((o) => (
                <FormControlLabel
                  key={o.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                  }
                  label={<Typography variant="body2">{o.name}</Typography>}
                />
              ))
            )}
          </Box>

          {initial && (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label="Active"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('anc_cancel')}</Button>
        <Button
          variant="contained"
          onClick={() =>
            onSave({ name, category, orderableIds: Array.from(selectedIds), sortOrder, isActive })
          }
          disabled={saving || !name.trim() || selectedIds.size === 0}
        >
          {saving ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfigAncillaryPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();

  const [section, setSection] = useState<SectionTab>('tests');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [editTest, setEditTest] = useState<AncillaryOrderable | null>(null);
  const [panelDialogOpen, setPanelDialogOpen] = useState(false);
  const [editPanel, setEditPanel] = useState<AncillaryPanel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'test' | 'panel'; id: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data: orderables = [], isLoading: loadingTests } = useQuery({
    queryKey: ['config-ancillary-orderables'],
    queryFn: () => ancillaryApi.getOrderables(),
  });

  const { data: panels = [], isLoading: loadingPanels } = useQuery({
    queryKey: ['config-ancillary-panels'],
    queryFn: () => ancillaryApi.getPanels(),
  });

  const createTestMutation = useMutation({
    mutationFn: (data: Parameters<typeof ancillaryApi.createOrderable>[0]) =>
      ancillaryApi.createOrderable(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-orderables'] });
      qc.invalidateQueries({ queryKey: ['ancillary-orderables'] });
      setTestDialogOpen(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
    },
  });

  const updateTestMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof ancillaryApi.updateOrderable>[1] }) =>
      ancillaryApi.updateOrderable(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-orderables'] });
      qc.invalidateQueries({ queryKey: ['ancillary-orderables'] });
      setTestDialogOpen(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
    },
  });

  const deleteTestMutation = useMutation({
    mutationFn: (id: number) => ancillaryApi.deleteOrderable(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-orderables'] });
      qc.invalidateQueries({ queryKey: ['ancillary-orderables'] });
      setDeleteConfirm(null);
    },
    onError: (err: unknown) => {
      setActionError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
      setDeleteConfirm(null);
    },
  });

  const createPanelMutation = useMutation({
    mutationFn: (data: Parameters<typeof ancillaryApi.createPanel>[0]) =>
      ancillaryApi.createPanel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-panels'] });
      qc.invalidateQueries({ queryKey: ['ancillary-panels'] });
      setPanelDialogOpen(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
    },
  });

  const updatePanelMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof ancillaryApi.updatePanel>[1] }) =>
      ancillaryApi.updatePanel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-panels'] });
      qc.invalidateQueries({ queryKey: ['ancillary-panels'] });
      setPanelDialogOpen(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
    },
  });

  const deletePanelMutation = useMutation({
    mutationFn: (id: number) => ancillaryApi.deletePanel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-ancillary-panels'] });
      qc.invalidateQueries({ queryKey: ['ancillary-panels'] });
      setDeleteConfirm(null);
    },
    onError: (err: unknown) => {
      setActionError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('errorGeneric'),
      );
      setDeleteConfirm(null);
    },
  });

  const categoryLabel = (cat: AncillaryCategory) => t(`anc_cat_${cat}` as Parameters<typeof t>[0]);

  // Group orderables by category
  const testsByCategory = ANCILLARY_CATEGORIES.reduce<Record<AncillaryCategory, AncillaryOrderable[]>>(
    (acc, cat) => {
      acc[cat] = orderables.filter((o) => o.category === cat);
      return acc;
    },
    {} as Record<AncillaryCategory, AncillaryOrderable[]>,
  );

  return (
    <ConfigLayout>
      <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {t('cfg_ancillaryTitle')}
      </Typography>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={section} onChange={(_, v: SectionTab) => setSection(v)}>
          <Tab value="tests" label={t('anc_tests')} />
          <Tab value="panels" label={t('anc_panels')} />
        </Tabs>
      </Box>

      {/* ── Individual Tests ── */}
      {section === 'tests' && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setEditTest(null);
                setMutationError(null);
                setTestDialogOpen(true);
              }}
            >
              {t('anc_addTest')}
            </Button>
          </Box>

          {loadingTests ? (
            <CircularProgress />
          ) : (
            ANCILLARY_CATEGORIES.map((cat) => {
              const catTests = testsByCategory[cat];
              if (catTests.length === 0) return null;
              return (
                <Paper key={cat} variant="outlined" sx={{ mb: 2 }}>
                  <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {categoryLabel(cat)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Sort</TableCell>
                        <TableCell>{t('anc_status')}</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {catTests.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>{o.name}</TableCell>
                          <TableCell>{o.sortOrder}</TableCell>
                          <TableCell>
                            <Chip
                              label={o.isActive ? 'Active' : 'Inactive'}
                              color={o.isActive ? 'success' : 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditTest(o);
                                  setMutationError(null);
                                  setTestDialogOpen(true);
                                }}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteConfirm({ type: 'test', id: o.id })}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              );
            })
          )}
        </Box>
      )}

      {/* ── Panels ── */}
      {section === 'panels' && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setEditPanel(null);
                setMutationError(null);
                setPanelDialogOpen(true);
              }}
            >
              {t('anc_addPanel')}
            </Button>
          </Box>

          {loadingPanels ? (
            <CircularProgress />
          ) : panels.length === 0 ? (
            <Typography color="text.secondary">{t('anc_noOrders')}</Typography>
          ) : (
            <Table size="small" component={Paper} variant="outlined">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>{t('anc_category')}</TableCell>
                  <TableCell>{t('anc_tests')}</TableCell>
                  <TableCell>{t('anc_status')}</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {panels.map((panel) => (
                  <TableRow key={panel.id}>
                    <TableCell>{panel.name}</TableCell>
                    <TableCell>
                      <Chip label={categoryLabel(panel.category)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                        {(panel.items ?? []).map((item) => (
                          <Chip
                            key={item.orderableId}
                            label={item.orderable?.name ?? item.orderableId}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={panel.isActive ? 'Active' : 'Inactive'}
                        color={panel.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditPanel(panel);
                            setMutationError(null);
                            setPanelDialogOpen(true);
                          }}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirm({ type: 'panel', id: panel.id })}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {/* Orderable dialog */}
      <OrderableDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        initial={editTest}
        saving={createTestMutation.isPending || updateTestMutation.isPending}
        error={mutationError}
        onSave={(data) => {
          if (editTest) {
            updateTestMutation.mutate({ id: editTest.id, data });
          } else {
            createTestMutation.mutate(data);
          }
        }}
      />

      {/* Panel dialog */}
      <PanelDialog
        open={panelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        initial={editPanel}
        orderables={orderables}
        saving={createPanelMutation.isPending || updatePanelMutation.isPending}
        error={mutationError}
        onSave={(data) => {
          if (editPanel) {
            updatePanelMutation.mutate({ id: editPanel.id, data });
          } else {
            createPanelMutation.mutate(data);
          }
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this item?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>{t('anc_cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (!deleteConfirm) return;
              if (deleteConfirm.type === 'test') {
                deleteTestMutation.mutate(deleteConfirm.id);
              } else {
                deletePanelMutation.mutate(deleteConfirm.id);
              }
            }}
            disabled={deleteTestMutation.isPending || deletePanelMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </ConfigLayout>
  );
}
