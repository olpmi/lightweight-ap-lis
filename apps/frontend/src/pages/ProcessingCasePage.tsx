import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  Breadcrumbs,
  Link,
  IconButton,
  Tooltip,
} from '@mui/material';
import { ExpandMore, Add, Science, Download, Delete, Save } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { orderApi, specimenApi, blockApi, reportApi } from '../api';
import { useAuth } from '../hooks/useAuth';
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

export default function ProcessingCasePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: orderData, isLoading } = useQuery<{ data: object }>({
    queryKey: ['order', orderId],
    queryFn: () => orderApi.get(orderId!).then((d) => ({ data: d })),
    enabled: Boolean(orderId),
  });

  const { data: materialsData, isLoading: loadingMaterials } = useQuery<{ data: { specimens: Specimen[] } }>({
    queryKey: ['materials', orderId],
    queryFn: () => orderApi.materials(orderId!) as Promise<{ data: { specimens: Specimen[] } }>,
    enabled: Boolean(orderId),
  });

  const { data: reportsData } = useQuery<{ data: object[] }>({
    queryKey: ['reports', orderId],
    queryFn: () => reportApi.list(orderId!).then((d) => ({ data: d as object[] })),
    enabled: Boolean(orderId),
  });

  const { mutateAsync: createBlocks, isPending: creatingBlocks } = useMutation({
    mutationFn: ({ specimenId, count }: { specimenId: string; count: number }) =>
      specimenApi.createBlocks(specimenId, count),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', orderId] }),
  });

  const { mutateAsync: createSlides, isPending: creatingSlides } = useMutation({
    mutationFn: ({ blockId, count, slideType }: { blockId: string; count: number; slideType?: string }) =>
      blockApi.createSlides(blockId, count, slideType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', orderId] }),
  });

  const { mutateAsync: doDeleteBlock } = useMutation({
    mutationFn: (blockId: string) => blockApi.deleteBlock(blockId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', orderId] }),
  });

  const { mutateAsync: doDeleteSlide } = useMutation({
    mutationFn: ({ blockId, slideId }: { blockId: string; slideId: string }) =>
      blockApi.deleteSlide(blockId, slideId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', orderId] }),
  });

  const [clinicalHistory, setClinicalHistory] = useState('');
  const [grossDescription, setGrossDescription] = useState('');
  const [historyInit, setHistoryInit] = useState(false);
  const [grossInit, setGrossInit] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockCounts, setBlockCounts] = useState<Record<string, number>>({});
  const [slideCounts, setSlideCounts] = useState<Record<string, number>>({});
  const [slideTypes, setSlideTypes] = useState<Record<string, string>>({});

  const order = orderData?.data as {
    orderId: string;
    caseType?: string;
    registeredDate: string;
    clinicalHistory?: string;
    patient: { lastName: string; firstName: string; patientId: string; dateOfBirth: string; sex: string };
    doctor: { lastName: string; firstName: string };
  } | undefined;

  useEffect(() => {
    if (order && !historyInit) {
      setClinicalHistory(order.clinicalHistory ?? '');
      setHistoryInit(true);
    }
  }, [order, historyInit]);

  useEffect(() => {
    const drafts = (reportsData?.data ?? []) as Array<{ isFinal: boolean; gross?: string }>;
    const latestDraft = drafts.filter((r) => !r.isFinal).at(-1);
    if (latestDraft && !grossInit) {
      setGrossDescription(latestDraft.gross ?? '');
      setGrossInit(true);
    }
  }, [reportsData, grossInit]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await orderApi.updateClinicalHistory(orderId!, clinicalHistory || null);
      const pathologistEmployeeId = user?.employeeId ?? undefined;
      await reportApi.createDraft(orderId!, { gross: grossDescription, pathologistEmployeeId });
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
    },
    onSuccess: () => {
      setIsSaved(true);
      setSaveSuccess('Case saved');
    },
    onError: () => setSaveError('Failed to save case'),
  });

  const specimens = materialsData?.data?.specimens ?? [];

  if (isLoading || loadingMaterials)
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/processing')}>
          Processing
        </Link>
        <Typography color="text.primary">{formatOrderIdDisplay(orderId ?? '')}</Typography>
      </Breadcrumbs>

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" data-testid="order-id-heading">
          {formatOrderIdDisplay(order?.orderId ?? '')}
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={saveMutation.isPending ? <CircularProgress size={14} /> : <Save />}
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="save-case-btn"
          >
            Save
          </Button>
          <Button
            href={orderApi.referenceStripsPdfUrl(orderId!)}
            target="_blank"
            startIcon={<Download />}
            variant="outlined"
            size="small"
            data-testid="download-strips-btn"
          >
            Reference Strips PDF
          </Button>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(null)}>
          {saveSuccess}
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}

      {order && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">Patient</Typography>
              <Typography>{order.patient.lastName}, {order.patient.firstName}</Typography>
              <Typography variant="caption">
                {order.patient.patientId} — DOB {new Date(order.patient.dateOfBirth).toLocaleDateString()}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">Clinician</Typography>
              <Typography>{order.doctor.lastName}, {order.doctor.firstName}</Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">Registered</Typography>
              <Typography>{new Date(order.registeredDate).toLocaleDateString()}</Typography>
              {order.caseType && <Chip label={order.caseType} size="small" sx={{ mt: 0.5 }} />}
            </Grid>
          </Grid>
        </Paper>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Clinical History</Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            size="small"
            value={clinicalHistory}
            onChange={(e) => { setClinicalHistory(e.target.value); setIsSaved(false); }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Gross Description</Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            size="small"
            value={grossDescription}
            onChange={(e) => { setGrossDescription(e.target.value); setIsSaved(false); }}
          />
        </Paper>
      </Box>

      <Typography variant="h6" mb={1}>Materials</Typography>
      {specimens.length === 0 && (
        <Alert severity="info">No specimens found for this case.</Alert>
      )}
      {specimens.map((spec) => (
        <Accordion key={spec.specimenId} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Science color="primary" />
              <Typography fontWeight={600}>Specimen {spec.specimenCode}</Typography>
              {spec.bodySite && <Chip label={spec.bodySite.bodySiteName} size="small" />}
              {spec.specimenType && <Chip label={spec.specimenType.specimenTypeName} size="small" variant="outlined" />}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <TextField
                label="# Blocks"
                type="number"
                size="small"
                value={blockCounts[spec.specimenId] ?? 1}
                onChange={(e) => setBlockCounts({ ...blockCounts, [spec.specimenId]: parseInt(e.target.value) || 1 })}
                sx={{ width: 80 }}
                inputProps={{ min: 1, max: 50 }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<Add />}
                onClick={() => createBlocks({ specimenId: spec.specimenId, count: blockCounts[spec.specimenId] ?? 1 })}
                disabled={creatingBlocks}
                data-testid={`create-blocks-${spec.specimenCode}`}
              >
                Add Block{(blockCounts[spec.specimenId] ?? 1) > 1 ? 's' : ''}
              </Button>
            </Box>

            {spec.blocks.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Block ID</TableCell>
                    <TableCell>Slides</TableCell>
                    <TableCell>Add Slides</TableCell>
                    {!isSaved && <TableCell align="center">Delete</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {spec.blocks.map((block) => (
                    <TableRow key={block.blockId}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{formatMaterialIdDisplay(block.blockId)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {block.slides.map((sl) => (
                            <Chip
                              key={sl.slideId}
                              label={`${formatMaterialIdDisplay(sl.slideId)} [${sl.slideType ?? 'H&E'}]`}
                              size="small"
                              onDelete={isSaved ? undefined : () => doDeleteSlide({ blockId: block.blockId, slideId: sl.slideId })}
                              deleteIcon={<Delete fontSize="small" />}
                            />
                          ))}
                          {block.slides.length === 0 && (
                            <Typography variant="caption" color="text.secondary">none</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <TextField
                            type="number"
                            size="small"
                            value={slideCounts[block.blockId] ?? 1}
                            onChange={(e) =>
                              setSlideCounts({ ...slideCounts, [block.blockId]: parseInt(e.target.value) || 1 })
                            }
                            sx={{ width: 70 }}
                            inputProps={{ min: 1, max: 100 }}
                          />
                          <FormControl size="small" sx={{ width: 120 }}>
                            <InputLabel>Type</InputLabel>
                            <Select
                              label="Type"
                              value={slideTypes[block.blockId] ?? 'H&E'}
                              onChange={(e) => setSlideTypes({ ...slideTypes, [block.blockId]: e.target.value })}
                            >
                              {['H&E', 'Unstained', 'IHC', 'Special stain'].map((t) => (
                                <MenuItem key={t} value={t}>{t}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Add />}
                            onClick={() =>
                              createSlides({
                                blockId: block.blockId,
                                count: slideCounts[block.blockId] ?? 1,
                                slideType: slideTypes[block.blockId] ?? 'H&E',
                              })
                            }
                            disabled={creatingSlides}
                            data-testid={`create-slides-${block.blockId}`}
                          >
                            Slides
                          </Button>
                        </Box>
                      </TableCell>
                      {!isSaved && (
                        <TableCell align="center">
                          <Tooltip title="Delete block and all its slides">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => doDeleteBlock(block.blockId)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
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
