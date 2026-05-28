import React, { useState, useEffect, useMemo } from 'react';
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
import { useLanguage } from '../../hooks/useLanguage';
import { ANCILLARY_CATEGORIES, type AncillaryCategory } from '@lis/shared';
import { formatMaterialIdDisplay } from '@lis/shared';

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

  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<AncillaryCategory>('HE_LEVELS');
  const [levelCount, setLevelCount] = useState(3);
  const [heOrdered, setHeOrdered] = useState(false);
  const [selectedByCategory, setSelectedByCategory] = useState<Partial<Record<AncillaryCategory, Set<number>>>>({});
  const [notesByCategory, setNotesByCategory] = useState<Partial<Record<AncillaryCategory, string>>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedBlockIds(
        preselectedBlockId ? new Set([preselectedBlockId]) : new Set(),
      );
      setSelectedCategory('HE_LEVELS');
      setLevelCount(3);
      setHeOrdered(false);
      setSelectedByCategory({});
      setNotesByCategory({});
      setSearchQuery('');
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedBlockId]);

  const { data: orderables = [] } = useQuery({
    queryKey: ['ancillary-orderables'],
    queryFn: () => ancillaryApi.getOrderables(),
    enabled: open,
  });

  const { data: panels = [] } = useQuery({
    queryKey: ['ancillary-panels'],
    queryFn: () => ancillaryApi.getPanels(),
    enabled: open,
  });

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

  // Per-category helpers
  const currentIds = selectedByCategory[selectedCategory] ?? new Set<number>();
  const currentNotes = notesByCategory[selectedCategory] ?? '';

  const tabCount = (cat: AncillaryCategory) => {
    if (cat === 'HE_LEVELS') return heOrdered ? 1 : 0;
    return selectedByCategory[cat]?.size ?? 0;
  };

  const totalSelected = ANCILLARY_CATEGORIES.filter((c) => c !== 'HE').reduce((sum, cat) => sum + tabCount(cat), 0);

  const toggleBlockId = (id: string) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleId = (id: number) => {
    setSelectedByCategory((prev) => {
      const current = new Set(prev[selectedCategory] ?? []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [selectedCategory]: current };
    });
  };

  const addAllFromPanel = (panelOrderableIds: number[]) => {
    setSelectedByCategory((prev) => {
      const current = new Set(prev[selectedCategory] ?? []);
      panelOrderableIds.forEach((id) => current.add(id));
      return { ...prev, [selectedCategory]: current };
    });
  };

  const setCurrentNotes = (val: string) => {
    setNotesByCategory((prev) => ({ ...prev, [selectedCategory]: val }));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (selectedBlockIds.size === 0) throw new Error('Select at least one block');
      if (totalSelected === 0) throw new Error('Select at least one test');

      const allItems: Array<{
        orderId: string; blockId: string; orderableId: number;
        levelCount?: number; notes?: string;
      }> = [];

      if (heOrdered) {
        const heLevelsOrderable = orderables.find((o) => o.category === 'HE_LEVELS' && o.isActive);
        if (!heLevelsOrderable) throw new Error('H&E Levels orderable not found');
        for (const blockId of selectedBlockIds) {
          allItems.push({
            orderId, blockId,
            orderableId: heLevelsOrderable.id,
            levelCount: levelCount || undefined,
            notes: notesByCategory['HE_LEVELS'] || undefined,
          });
        }
      }

      for (const cat of ANCILLARY_CATEGORIES) {
        if (cat === 'HE_LEVELS') continue;
        const ids = selectedByCategory[cat];
        if (!ids || ids.size === 0) continue;
        const catNotes = notesByCategory[cat] || undefined;
        for (const blockId of selectedBlockIds) {
          for (const orderableId of ids) {
            allItems.push({ orderId, blockId, orderableId, notes: catNotes });
          }
        }
      }

      return ancillaryApi.createOrders(allItems);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ancillary-orders', orderId] });
      qc.invalidateQueries({ queryKey: ['ancillary-block-counts', orderId] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? (err instanceof Error ? err.message : t('errorGeneric')),
      );
    },
  });

  const categoryLabel = (cat: AncillaryCategory) => t(`anc_cat_${cat}` as Parameters<typeof t>[0]);

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
                    {s.blocks.map((b) => (
                      <Chip
                        key={b.blockId}
                        label={formatMaterialIdDisplay(b.blockId)}
                        size="small"
                        color={selectedBlockIds.has(b.blockId) ? 'primary' : 'default'}
                        onClick={() => toggleBlockId(b.blockId)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
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

          {/* Search field (hidden for H&E Levels which has only one orderable) */}
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

          {/* H&E Levels */}
          {selectedCategory === 'HE_LEVELS' && (
            <Stack spacing={1.5}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={heOrdered}
                    onChange={(e) => setHeOrdered(e.target.checked)}
                  />
                }
                label={t('anc_heInclude')}
              />
              {heOrdered && (
                <>
                  <TextField
                    label={t('anc_levelCount')}
                    type="number"
                    size="small"
                    value={levelCount}
                    onChange={(e) => setLevelCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
                </>
              )}
            </Stack>
          )}

          {/* IHC / Molecular — panels + individuals */}
          {(selectedCategory === 'IHC' || selectedCategory === 'MOLECULAR') && (
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
                            {visibleItems.map((item) => (
                              <Chip
                                key={item.orderableId}
                                label={item.orderable?.name ?? item.orderableId}
                                size="small"
                                color={currentIds.has(item.orderableId) ? 'primary' : 'default'}
                                onClick={() => toggleId(item.orderableId)}
                                sx={{ cursor: 'pointer' }}
                              />
                            ))}
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
                    {filteredOrderables.map((o) => (
                      <FormControlLabel
                        key={o.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={currentIds.has(o.id)}
                            onChange={() => toggleId(o.id)}
                          />
                        }
                        label={<Typography variant="body2">{o.name}</Typography>}
                      />
                    ))}
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
          {(selectedCategory === 'SPECIAL_STAIN' || selectedCategory === 'SEND_OUT') && (
            <Stack spacing={1.5}>
              {filteredOrderables.length === 0 && searchQuery.trim() ? (
                <Typography variant="body2" color="text.disabled" textAlign="center">
                  {t('noResults')}
                </Typography>
              ) : (
                filteredOrderables.map((o) => (
                  <FormControlLabel
                    key={o.id}
                    control={
                      <Checkbox
                        checked={currentIds.has(o.id)}
                        onChange={() => toggleId(o.id)}
                      />
                    }
                    label={o.name}
                  />
                ))
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

          {/* Cross-category summary: tests queued in other tabs */}
          {(() => {
            const summaryCats = ANCILLARY_CATEGORIES.filter(
              (cat) => cat !== selectedCategory && tabCount(cat) > 0,
            );
            if (summaryCats.length === 0) return null;
            return (
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
                  {t('anc_orderSummary')}
                </Typography>
                <Stack spacing={0.75}>
                  {summaryCats.map((cat) => (
                    <Box key={cat} display="flex" alignItems="flex-start" gap={1}>
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100, pt: 0.25 }}>
                        {categoryLabel(cat)}:
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {cat === 'HE_LEVELS' ? (
                          <Chip label={`×${levelCount} levels`} size="small" color="primary" />
                        ) : (
                          Array.from(selectedByCategory[cat] ?? []).map((id) => {
                            const o = orderables.find((x) => x.id === id);
                            return (
                              <Chip key={id} label={o?.name ?? `#${id}`} size="small" color="primary" />
                            );
                          })
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            );
          })()}
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
          disabled={
            createMutation.isPending ||
            selectedBlockIds.size === 0 ||
            totalSelected === 0
          }
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
