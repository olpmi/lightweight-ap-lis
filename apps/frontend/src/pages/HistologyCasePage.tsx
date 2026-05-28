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
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Breadcrumbs,
  Link,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import { ExpandMore, Add, Science, Delete } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { orderApi, specimenApi, blockApi } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import { formatOrderIdDisplay, formatMaterialIdDisplay } from '@lis/shared';

interface Slide {
  slideId: string;
  slideNumber: number;
  slideType?: string;
}
interface Block {
  blockId: string;
  blockNumber: number;
  slides: Slide[];
}
interface Specimen {
  specimenId: string;
  specimenCode: string;
  bodySite?: { bodySiteName: string };
  specimenType?: { specimenTypeName: string };
  blocks: Block[];
}

export default function HistologyCasePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, tCaseType, tSite, tOrgan, tSpecimenType, tSlideType } = useLanguage();

  const [blockCounts, setBlockCounts] = useState<Record<string, number>>({});
  const [slideCounts, setSlideCounts] = useState<Record<string, number>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data: orderData, isLoading: orderLoading } = useQuery<{ data: object }>({
    queryKey: ['order', orderId],
    queryFn: () => orderApi.get(orderId!).then((d) => ({ data: d })),
    enabled: Boolean(orderId),
  });

  const { data: materialsData, isLoading: materialsLoading } = useQuery<{ data: { specimens: Specimen[] } }>({
    queryKey: ['materials', orderId],
    queryFn: () => orderApi.materials(orderId!) as Promise<{ data: { specimens: Specimen[] } }>,
    enabled: Boolean(orderId),
  });

  const { mutateAsync: createBlocks, isPending: creatingBlocks } = useMutation({
    mutationFn: ({ specimenId, count }: { specimenId: string; count: number }) =>
      specimenApi.createBlocks(specimenId, count),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials', orderId] });
      qc.invalidateQueries({ queryKey: ['histology-queue'] });
      setActionSuccess(t('anc_statusUpdated'));
    },
    onError: () => setActionError(t('errorGeneric')),
  });

  const { mutateAsync: createSlides, isPending: creatingSlides } = useMutation({
    mutationFn: ({ blockId, count }: { blockId: string; count: number }) =>
      blockApi.createSlides(blockId, count, 'H&E'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials', orderId] });
      qc.invalidateQueries({ queryKey: ['histology-queue'] });
      setActionSuccess(t('anc_statusUpdated'));
    },
    onError: () => setActionError(t('errorGeneric')),
  });

  const { mutateAsync: doDeleteSlide } = useMutation({
    mutationFn: ({ blockId, slideId }: { blockId: string; slideId: string }) =>
      blockApi.deleteSlide(blockId, slideId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials', orderId] });
      qc.invalidateQueries({ queryKey: ['histology-queue'] });
    },
    onError: () => setActionError(t('errorGeneric')),
  });

  const order = orderData?.data as {
    orderId: string;
    caseType?: string;
    registeredDate: string;
    patient: { lastName: string; firstName: string; patientId: string; dateOfBirth: string; sex: string };
    doctor: { lastName: string; firstName: string };
  } | undefined;

  const specimens = materialsData?.data?.specimens ?? [];
  const isCytology = order?.caseType === 'Cytology';

  const localizeBodySiteName = (name: string) => {
    const organ = tOrgan(name);
    if (organ !== name) return organ;
    return tSite(name);
  };

  if (orderLoading || materialsLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => navigate('/histology')}
        >
          {t('nav_histology')}
        </Link>
        <Typography color="text.primary">{formatOrderIdDisplay(orderId ?? '')}</Typography>
      </Breadcrumbs>

      <Typography variant="h5" fontWeight={700} mb={2}>
        {formatOrderIdDisplay(order?.orderId ?? '')}
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

      {order && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">{t('oe_patient')}</Typography>
              <Typography>{order.patient.lastName}, {order.patient.firstName}</Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">{t('oe_clinician')}</Typography>
              <Typography>{order.doctor.lastName}, {order.doctor.firstName}</Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">{t('pq_registered')}</Typography>
              <Typography>{new Date(order.registeredDate).toLocaleDateString()}</Typography>
              {order.caseType && (
                <Chip label={tCaseType(order.caseType)} size="small" sx={{ mt: 0.5 }} />
              )}
            </Grid>
          </Grid>
        </Paper>
      )}

      <Typography variant="h6" mb={1}>{t('pc_materials')}</Typography>

      {specimens.length === 0 && (
        <Alert severity="info">{t('pc_noSpecimens')}</Alert>
      )}

      {specimens.map((spec) => (
        <Accordion key={spec.specimenId} defaultExpanded sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Science color="primary" />
              <Typography fontWeight={600}>
                {t('oe_specimen')} {spec.specimenCode}
              </Typography>
              {spec.bodySite && (
                <Chip label={localizeBodySiteName(spec.bodySite.bodySiteName)} size="small" />
              )}
              {spec.specimenType && (
                <Chip
                  label={tSpecimenType(spec.specimenType.specimenTypeName)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {/* For cytology cases: allow adding cell blocks */}
            {isCytology && (
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <TextField
                  label={t('pc_numBlocks')}
                  type="number"
                  size="small"
                  value={blockCounts[spec.specimenId] ?? 1}
                  onChange={(e) =>
                    setBlockCounts({ ...blockCounts, [spec.specimenId]: parseInt(e.target.value) || 1 })
                  }
                  sx={{ width: 80 }}
                  inputProps={{ min: 1, max: 10 }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Add />}
                  onClick={() =>
                    createBlocks({ specimenId: spec.specimenId, count: blockCounts[spec.specimenId] ?? 1 })
                  }
                  disabled={creatingBlocks}
                >
                  {t('pc_addBlocks')}
                </Button>
              </Box>
            )}

            {spec.blocks.length === 0 ? (
              <Typography variant="caption" color="text.secondary">{t('pc_none')}</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '18%' }}>{t('pc_blockId')}</TableCell>
                    <TableCell sx={{ width: 80 }}>{t('pc_numSlides')}</TableCell>
                    <TableCell sx={{ width: 110 }}></TableCell>
                    <TableCell>{t('pc_slides')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {spec.blocks.map((block) => (
                    <TableRow key={block.blockId}>
                      <TableCell>
                        <Chip
                          label={formatMaterialIdDisplay(block.blockId)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={slideCounts[block.blockId] ?? 1}
                          onChange={(e) =>
                            setSlideCounts({
                              ...slideCounts,
                              [block.blockId]: parseInt(e.target.value) || 1,
                            })
                          }
                          sx={{ width: 70 }}
                          inputProps={{ min: 1, max: 100 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Add />}
                          onClick={() =>
                            createSlides({
                              blockId: block.blockId,
                              count: slideCounts[block.blockId] ?? 1,
                            })
                          }
                          disabled={creatingSlides}
                        >
                          {t('pc_addSlidesBtn')}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {block.slides.map((sl) => (
                            <Chip
                              key={sl.slideId}
                              label={`${formatMaterialIdDisplay(sl.slideId)} [${tSlideType(sl.slideType ?? 'H&E')}]`}
                              size="small"
                              onDelete={() =>
                                doDeleteSlide({ blockId: block.blockId, slideId: sl.slideId })
                              }
                              deleteIcon={
                                <Tooltip title={t('common_delete')}>
                                  <Delete fontSize="small" />
                                </Tooltip>
                              }
                            />
                          ))}
                          {block.slides.length === 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {t('pc_noSlidesYet')}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
