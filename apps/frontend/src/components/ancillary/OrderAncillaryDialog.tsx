import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Drawer,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  InputAdornment,
  Tabs,
  Tab,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ancillaryApi } from '../../api';
import { qk } from '../../api/queryKeys';
import { useLanguage } from '../../hooks/useLanguage';
import { ANCILLARY_CATEGORIES, type AncillaryCategory } from '@lis/shared';
import { formatMaterialIdDisplay } from '@lis/shared';

type OrderedItem = { blockId: string; orderableId: number; levelCount?: number };

interface Block {
  blockId: string;
  slides: Array<{ slideId: string; slideType?: string }>;
}

interface Specimen {
  specimenId: string;
  specimenCode: string;
  blocks: Block[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  specimens: Specimen[];
  preselectedBlockId?: string;
}

export default function OrderAncillaryDialog({
  open,
  onClose,
  orderId,
  specimens,
  preselectedBlockId,
}: Props) {
  const { t } = useLanguage();
  const qc = useQueryClient();

  const allBlocks = specimens.flatMap((s) => s.blocks);

  const [activeBlockIds, setActiveBlockIds] = useState<Set<string>>(new Set());
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<AncillaryCategory>('HE_LEVELS');
  const [notesByCategory, setNotesByCategory] = useState<Partial<Record<AncillaryCategory, string>>>({});
  const [levelCountDraft, setLevelCountDraft] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveBlockIds(preselectedBlockId ? new Set([preselectedBlockId]) : new Set());
      setOrderedItems([]);
      setSelectedCategory('HE_LEVELS');
      setNotesByCategory({});
      setLevelCountDraft(3);
      setSearchQuery('');
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedBlockId]);

  const { data: orderables = [] } = useQuery({
    queryKey: qk.ancillaryOrderables,
    queryFn: () => ancillaryApi.getOrderables(),
    enabled: open,
  });

  const { data: panels = [] } = useQuery({
    queryKey: qk.ancillaryPanels,
    queryFn: () => ancillaryApi.getPanels(),
    enabled: open,
  });

  const heLevelsOrderable = useMemo(
    () => orderables.find((o) => o.category === 'HE_LEVELS' && o.isActive),
    [orderables],
  );

  const categoryOrderables = orderables.filter(
    (o) => o.category === selectedCategory && o.isActive,
  );

  const categoryPanels = panels.filter(
    (p) => p.category === selectedCategory && p.isActive,
  );

  const filteredOrderables = useMemo(() => {
    if (!searchQuery.trim()) return categoryOrderables;
    const q = searchQuery.toLowerCase();
    return categoryOrderables.filter((o) => o.name.toLowerCase().includes(q));
  }, [categoryOrderables, searchQuery]);

  // When the active block selection changes, sync levelCountDraft from existing HE items if consistent
  useEffect(() => {
    if (!heLevelsOrderable || activeBlockIds.size === 0) return;
    const heItems = orderedItems.filter(
      (i) => i.orderableId === heLevelsOrderable.id && activeBlockIds.has(i.blockId),
    );
    if (heItems.length === 0) return;
    const first = heItems[0].levelCount ?? 3;
    if (heItems.every((i) => (i.levelCount ?? 3) === first)) setLevelCountDraft(first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockIds]);

  // Auto-include H&E Levels for every active block whenever the user is on the
  // HE_LEVELS tab and at least one block is selected. The dedicated checkbox UI
  // was removed; presence of the tab + active blocks is itself the consent.
  useEffect(() => {
    if (!heLevelsOrderable || selectedCategory !== 'HE_LEVELS' || activeBlockIds.size === 0) return;
    const id = heLevelsOrderable.id;
    setOrderedItems((prev) => {
      const missing = [...activeBlockIds].filter(
        (blockId) => !prev.some((i) => i.blockId === blockId && i.orderableId === id),
      );
      if (missing.length === 0) return prev;
      return [...prev, ...missing.map((blockId) => ({ blockId, orderableId: id, levelCount: levelCountDraft }))];
    });
  // levelCountDraft intentionally omitted: we don't want to add new rows when the user just changes the count.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockIds, selectedCategory, heLevelsOrderable]);

  // --- Derived check states ---

  const testCheckState = useCallback(
    (orderableId: number): 'checked' | 'indeterminate' | 'unchecked' => {
      if (activeBlockIds.size === 0) return 'unchecked';
      let count = 0;
      for (const blockId of activeBlockIds) {
        if (orderedItems.some((i) => i.blockId === blockId && i.orderableId === orderableId))
          count++;
      }
      if (count === activeBlockIds.size) return 'checked';
      if (count > 0) return 'indeterminate';
      return 'unchecked';
    },
    [activeBlockIds, orderedItems],
  );

  const tabCount = (cat: AncillaryCategory) => {
    if (cat === 'HE_LEVELS') {
      return heLevelsOrderable &&
        orderedItems.some((i) => i.orderableId === heLevelsOrderable.id)
        ? 1
        : 0;
    }
    const catIds = new Set(orderables.filter((o) => o.category === cat).map((o) => o.id));
    return new Set(
      orderedItems.filter((i) => catIds.has(i.orderableId)).map((i) => i.orderableId),
    ).size;
  };

  const currentNotes = notesByCategory[selectedCategory] ?? '';

  // --- Mutators ---

  const toggleBlockId = (id: string) => {
    setActiveBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOrderable = (orderableId: number) => {
    if (activeBlockIds.size === 0) return;
    const allHave = [...activeBlockIds].every((blockId) =>
      orderedItems.some((i) => i.blockId === blockId && i.orderableId === orderableId),
    );
    if (allHave) {
      setOrderedItems((prev) =>
        prev.filter((i) => !(activeBlockIds.has(i.blockId) && i.orderableId === orderableId)),
      );
    } else {
      setOrderedItems((prev) => {
        const toAdd = [...activeBlockIds]
          .filter(
            (blockId) =>
              !prev.some((i) => i.blockId === blockId && i.orderableId === orderableId),
          )
          .map((blockId) => ({ blockId, orderableId }));
        return [...prev, ...toAdd];
      });
    }
  };

  const setLevelCountForActive = (n: number) => {
    if (!heLevelsOrderable) return;
    const id = heLevelsOrderable.id;
    setOrderedItems((prev) =>
      prev.map((i) =>
        activeBlockIds.has(i.blockId) && i.orderableId === id ? { ...i, levelCount: n } : i,
      ),
    );
  };

  const addAllFromPanel = (panelOrderableIds: number[]) => {
    if (activeBlockIds.size === 0) return;
    setOrderedItems((prev) => {
      const toAdd: OrderedItem[] = [];
      for (const orderableId of panelOrderableIds) {
        for (const blockId of activeBlockIds) {
          if (!prev.some((i) => i.blockId === blockId && i.orderableId === orderableId)) {
            toAdd.push({ blockId, orderableId });
          }
        }
      }
      return [...prev, ...toAdd];
    });
  };

  const removeOrderedItem = (blockId: string, orderableId: number) => {
    setOrderedItems((prev) =>
      prev.filter((i) => !(i.blockId === blockId && i.orderableId === orderableId)),
    );
  };

  const setCurrentNotes = (val: string) => {
    setNotesByCategory((prev) => ({ ...prev, [selectedCategory]: val }));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (orderedItems.length === 0) throw new Error('Select at least one test');
      const allItems = orderedItems.map((item) => {
        const orderable = orderables.find((o) => o.id === item.orderableId);
        const cat = orderable?.category;
        return {
          orderId,
          blockId: item.blockId,
          orderableId: item.orderableId,
          levelCount: item.levelCount,
          notes: (cat ? notesByCategory[cat] : undefined) || undefined,
        };
      });
      return ancillaryApi.createOrders(allItems);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ancillaryOrders.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: qk.ancillaryBlockCounts.byOrder(orderId) });
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? (err instanceof Error ? err.message : t('errorGeneric')),
      );
    },
  });

  const categoryLabel = (cat: AncillaryCategory) =>
    t(`anc_cat_${cat}` as Parameters<typeof t>[0]);

  const noMaterialActive = activeBlockIds.size === 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 640 }, display: 'flex', flexDirection: 'column' } }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6">{t('anc_orderAncillary')}</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Scrollable body */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Block multi-select chips */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.75} display="block">
              {t('anc_selectBlocks')}
            </Typography>
            <Stack spacing={0.75}>
              {specimens.map((s) => (
                <Box key={s.specimenId}>
                  {specimens.length > 1 && (
                    <Typography variant="caption" color="text.disabled" sx={{ mb: 0.25 }} display="block">
                      {s.specimenCode}
                    </Typography>
                  )}
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {s.blocks.map((b) => {
                      const isActive = activeBlockIds.has(b.blockId);
                      const hasOrders = orderedItems.some((i) => i.blockId === b.blockId);
                      return (
                        <Chip
                          key={b.blockId}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span>{formatMaterialIdDisplay(b.blockId)}</span>
                              {hasOrders && !isActive && (
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'inline-block',
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: 'primary.main',
                                    opacity: 0.7,
                                  }}
                                />
                              )}
                            </Box>
                          }
                          size="small"
                          color={isActive ? 'primary' : 'default'}
                          onClick={() => toggleBlockId(b.blockId)}
                          sx={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Category tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={selectedCategory}
              onChange={(_, v: AncillaryCategory) => {
                setSelectedCategory(v);
                setSearchQuery('');
              }}
              variant="scrollable"
              scrollButtons="auto"
            >
              {ANCILLARY_CATEGORIES.filter((c) => c !== 'HE').map((cat) => {
                const count = tabCount(cat);
                return (
                  <Tab
                    key={cat}
                    value={cat}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <span>{categoryLabel(cat)}</span>
                        {count > 0 && (
                          <Chip
                            label={count}
                            size="small"
                            color="primary"
                            sx={{ height: 18, minWidth: 18, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 } }}
                          />
                        )}
                      </Box>
                    }
                  />
                );
              })}
            </Tabs>
          </Box>

          {/* Search field (hidden for H&E Levels) */}
          {selectedCategory !== 'HE_LEVELS' && (
            <TextField
              size="small"
              fullWidth
              placeholder={t('anc_searchTests')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          )}

          {/* No-material-active hint */}
          {noMaterialActive && (
            <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 1 }}>
              {t('anc_selectMaterialFirst')}
            </Typography>
          )}

          {/* H&E Levels */}
          {selectedCategory === 'HE_LEVELS' && !noMaterialActive && (
            <Stack spacing={1.5}>
              <TextField
                label={t('anc_levelCount')}
                type="number"
                size="small"
                value={levelCountDraft}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
                  setLevelCountDraft(n);
                  setLevelCountForActive(n);
                }}
                inputProps={{ min: 1, max: 20 }}
                sx={{ width: 160 }}
              />
              <TextField
                label={t('anc_notes')}
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={currentNotes}
                onChange={(e) => setCurrentNotes(e.target.value)}
              />
            </Stack>
          )}

          {/* IHC / Molecular — panels + individuals */}
          {!noMaterialActive &&
            (selectedCategory === 'IHC' || selectedCategory === 'MOLECULAR') && (
              <Stack spacing={2}>
                {categoryPanels.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
                      {t('anc_panels')}
                    </Typography>
                    <Stack spacing={1}>
                      {categoryPanels.map((panel) => {
                        const panelItems = panel.items ?? [];
                        const q = searchQuery.trim().toLowerCase();
                        const panelNameMatches = q && panel.name.toLowerCase().includes(q);
                        const visibleItems = q && !panelNameMatches
                          ? panelItems.filter((item) =>
                              item.orderable?.name?.toLowerCase().includes(q),
                            )
                          : panelItems;
                        if (q && !panelNameMatches && visibleItems.length === 0) return null;
                        const panelOrderableIds = panelItems
                          .map((item) => item.orderableId)
                          .filter((id) => orderables.some((o) => o.id === id && o.isActive));
                        return (
                          <Box
                            key={panel.id}
                            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                          >
                            <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                              <Typography variant="body2" fontWeight={600}>
                                {panel.name}
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => addAllFromPanel(panelOrderableIds)}
                              >
                                + {t('anc_panels')}
                              </Button>
                            </Box>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                              {visibleItems.map((item) => {
                                const state = testCheckState(item.orderableId);
                                return (
                                  <Chip
                                    key={item.orderableId}
                                    label={item.orderable?.name ?? item.orderableId}
                                    size="small"
                                    color={state === 'unchecked' ? 'default' : 'primary'}
                                    variant={state === 'indeterminate' ? 'outlined' : 'filled'}
                                    onClick={() => toggleOrderable(item.orderableId)}
                                    sx={{ cursor: 'pointer' }}
                                  />
                                );
                              })}
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                    {filteredOrderables.length > 0 && <Divider sx={{ mt: 2, mb: 1 }} />}
                  </Box>
                )}

                {filteredOrderables.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
                      {t('anc_tests')}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      {filteredOrderables.map((o) => {
                        const state = testCheckState(o.id);
                        return (
                          <FormControlLabel
                            key={o.id}
                            control={
                              <Checkbox
                                size="small"
                                checked={state === 'checked'}
                                indeterminate={state === 'indeterminate'}
                                onChange={() => toggleOrderable(o.id)}
                              />
                            }
                            label={<Typography variant="body2">{o.name}</Typography>}
                          />
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {filteredOrderables.length === 0 && searchQuery.trim() && (
                  <Typography variant="body2" color="text.disabled" textAlign="center">
                    {t('noResults')}
                  </Typography>
                )}

                <TextField
                  label={t('anc_notes')}
                  size="small"
                  fullWidth
                multiline
                minRows={2}
                value={currentNotes}
                onChange={(e) => setCurrentNotes(e.target.value)}
              />
            </Stack>
          )}

          {/* Special Stains / Send-out — simple checkbox list */}
          {!noMaterialActive &&
            (selectedCategory === 'SPECIAL_STAIN' || selectedCategory === 'SEND_OUT') && (
              <Stack spacing={1.5}>
                {filteredOrderables.length === 0 && searchQuery.trim() ? (
                  <Typography variant="body2" color="text.disabled" textAlign="center">
                    {t('noResults')}
                  </Typography>
                ) : (
                  filteredOrderables.map((o) => {
                    const state = testCheckState(o.id);
                    return (
                      <FormControlLabel
                        key={o.id}
                        control={
                          <Checkbox
                            checked={state === 'checked'}
                            indeterminate={state === 'indeterminate'}
                            onChange={() => toggleOrderable(o.id)}
                          />
                        }
                        label={o.name}
                      />
                    );
                  })
                )}
                <TextField
                  label={t('anc_notes')}
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={currentNotes}
                  onChange={(e) => setCurrentNotes(e.target.value)}
                />
              </Stack>
            )}

          {/* Per-material order summary */}
          {orderedItems.length > 0 && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
                {t('anc_orderSummary')}
              </Typography>
              <Stack spacing={1}>
                {allBlocks
                  .filter((b) => orderedItems.some((i) => i.blockId === b.blockId))
                  .map((b) => (
                    <Box key={b.blockId}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
                        {formatMaterialIdDisplay(b.blockId)}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {orderedItems
                          .filter((i) => i.blockId === b.blockId)
                          .map((item) => {
                            const orderable = orderables.find((o) => o.id === item.orderableId);
                            const label = item.levelCount
                              ? `${orderable?.name ?? `#${item.orderableId}`} ×${item.levelCount}`
                              : (orderable?.name ?? `#${item.orderableId}`);
                            return (
                              <Chip
                                key={item.orderableId}
                                label={label}
                                size="small"
                                color="primary"
                                onDelete={() => removeOrderedItem(b.blockId, item.orderableId)}
                              />
                            );
                          })}
                      </Stack>
                    </Box>
                  ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>

      {/* Sticky footer */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Button onClick={onClose}>{t('anc_cancel')}</Button>
        <Button
          variant="contained"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || orderedItems.length === 0}
        >
          {createMutation.isPending ? (
            <CircularProgress size={18} />
          ) : (
            t('anc_orderAncillary')
          )}
        </Button>
      </Box>
    </Drawer>
  );
}
