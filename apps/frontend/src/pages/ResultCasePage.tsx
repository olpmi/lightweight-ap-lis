import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Breadcrumbs,
  Link,
  Tabs,
  Tab,
} from '@mui/material';
import { ExpandMore, Send, Refresh, PictureAsPdf, DragIndicator } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { orderApi, reportApi, lookupApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { formatOrderIdDisplay, formatMaterialIdDisplay } from '@lis/shared';

interface Employee {
  employeeId: number | bigint;
  firstName: string;
  lastName: string;
  employeeRole?: { roleName: string };
}
interface Report {
  reportId: number | bigint;
  versionNumber: number;
  diagnosis?: string;
  comment?: string;
  gross?: string;
  synopticData?: string;
  isFinal: boolean;
  reactivationType?: string;
  signedOutDatetime?: string;
  pathologist?: Employee;
  reportTemplate?: { reportTemplateId: number; templateName: string; templateText?: string };
  reportFiles?: Array<{ reportFileId: number | bigint; fileType: string }>;
}

type PanelId = 'diagnosis' | 'comment' | 'synoptic' | 'gross' | 'clinicalHistory';

const DEFAULT_PANEL_ORDER: PanelId[] = ['diagnosis', 'comment', 'synoptic', 'gross', 'clinicalHistory'];

const PANEL_LABELS: Record<PanelId, string> = {
  diagnosis: 'Final Diagnosis',
  comment: 'Comment',
  synoptic: 'Microscopic Description',
  gross: 'Gross Description',
  clinicalHistory: 'Clinical History',
};

export default function ResultCasePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({
    diagnosis: '',
    comment: '',
    gross: '',
    synopticData: '',
    reportTemplateId: '' as number | '',
  });
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Panel drag-to-reorder state
  const [panelOrder, setPanelOrder] = useState<PanelId[]>([...DEFAULT_PANEL_ORDER]);
  const [draggingPanel, setDraggingPanel] = useState<PanelId | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<PanelId | null>(null);

  // â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data: orderData, isLoading } = useQuery<{ data: object }>({
    queryKey: ['order', orderId],
    queryFn: () => orderApi.get(orderId!).then((d) => ({ data: d })),
    enabled: Boolean(orderId),
  });

  const { data: reportsData, isLoading: loadingReports } = useQuery<{ data: Report[] }>({
    queryKey: ['reports', orderId],
    queryFn: () => reportApi.list(orderId!).then((d) => ({ data: d as Report[] })),
    enabled: Boolean(orderId),
  });

  const { data: materialsData } = useQuery({
    queryKey: ['materials', orderId],
    queryFn: () => orderApi.materials(orderId!),
    enabled: Boolean(orderId),
  });

  const { data: templates } = useQuery<object[]>({
    queryKey: ['report-templates'],
    queryFn: lookupApi.reportTemplates,
  });

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const drafts = reportsData?.data?.filter((r) => !r.isFinal) ?? [];
  const finalReports = reportsData?.data?.filter((r) => r.isFinal) ?? [];
  const latestDraft = drafts[drafts.length - 1];
  const latestFinal = finalReports[finalReports.length - 1];
  const isSignedOut = Boolean(latestFinal && !drafts.length);
  const canSignOut = Boolean(form.diagnosis.trim() && form.gross.trim());

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  React.useEffect(() => {
    if (latestDraft && !form.diagnosis && !form.gross) {
      setForm({
        diagnosis: latestDraft.diagnosis ?? '',
        comment: latestDraft.comment ?? '',
        gross: latestDraft.gross ?? '',
        synopticData: latestDraft.synopticData ?? '',
        reportTemplateId: latestDraft.reportTemplate?.reportTemplateId ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDraft]);

  React.useEffect(() => {
    const o = orderData?.data as { clinicalHistory?: string | null } | undefined;
    if (o !== undefined) setClinicalHistory(o.clinicalHistory ?? '');
  }, [orderData]);

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const saveHistoryMutation = useMutation({
    mutationFn: () => orderApi.updateClinicalHistory(orderId!, clinicalHistory || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      setSuccess('Clinical history saved');
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Update failed'),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      reportApi.createDraft(orderId!, {
        diagnosis: form.diagnosis || undefined,
        comment: form.comment || undefined,
        gross: form.gross || undefined,
        synopticData: form.synopticData || undefined,
        reportTemplateId: form.reportTemplateId || undefined,
        pathologistEmployeeId: user?.employeeId ? Number(user.employeeId) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      setSuccess('Draft saved');
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Save failed'),
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const pathologistId = user?.employeeId;
      if (!pathologistId) throw new Error('Not authenticated');
      const data = {
        diagnosis: form.diagnosis,
        comment: form.comment || undefined,
        gross: form.gross,
        reportTemplateId: form.reportTemplateId || undefined,
        synopticData: form.synopticData || undefined,
        pathologistEmployeeId: Number(pathologistId),
      };
      // Create draft first if none exists, then sign it out
      let reportId: number;
      if (latestDraft) {
        reportId = Number(latestDraft.reportId);
      } else {
        const created = await reportApi.createDraft(orderId!, data) as { reportId: number | bigint };
        reportId = Number(created.reportId);
      }
      return reportApi.signOut(reportId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      qc.invalidateQueries({ queryKey: ['result-queue'] });
      setSignOutDialogOpen(false);
      setSuccess('Report signed out successfully');
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Sign-out failed'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (reactivationType: 'revise' | 'addend') => reportApi.reactivate(orderId!, reactivationType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      setReactivateDialogOpen(false);
      setSuccess('Case reactivated. A new draft has been created.');
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Reactivation failed'),
  });

  // â”€â”€ Drag handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDragStart = (e: React.DragEvent, id: PanelId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPanel(id);
  };

  const handleDragOver = (e: React.DragEvent, id: PanelId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggingPanel) setDragOverPanel(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: PanelId) => {
    e.preventDefault();
    if (!draggingPanel || draggingPanel === targetId) return;
    setPanelOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggingPanel);
      const toIdx = next.indexOf(targetId);
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
    setDraggingPanel(null);
    setDragOverPanel(null);
  };

  const handleDragEnd = () => {
    setDraggingPanel(null);
    setDragOverPanel(null);
  };

  // â”€â”€ Template handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleTemplateSelect = (templateId: number) => {
    const tpl = (templates as Array<{ reportTemplateId: number; templateText?: string }> ?? []).find(
      (t) => t.reportTemplateId === templateId
    );
    setForm({ ...form, reportTemplateId: templateId, synopticData: tpl?.templateText ?? '' });
  };

  // â”€â”€ Panel content renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const renderPanelContent = (id: PanelId) => {
    if (isSignedOut) {
      const text =
        id === 'diagnosis' ? latestFinal?.diagnosis :
        id === 'comment' ? latestFinal?.comment :
        id === 'gross' ? latestFinal?.gross :
        id === 'synoptic' ? latestFinal?.synopticData :
        clinicalHistory;
      return (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: text ? 'text.primary' : 'text.disabled' }}>
          {text || 'â€”'}
        </Typography>
      );
    }
    switch (id) {
      case 'diagnosis':
        return (
          <TextField
            label="Final Diagnosis"
            multiline
            minRows={6}
            fullWidth
            required
            value={form.diagnosis}
            onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            inputProps={{ 'data-testid': 'diagnosis-input' }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'comment':
        return (
          <TextField
            label="Comment"
            multiline
            minRows={6}
            fullWidth
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'synoptic':
        return (
          <Stack spacing={1.5}>
            <FormControl size="small" fullWidth>
              <InputLabel>CAP Template (optional)</InputLabel>
              <Select
                label="CAP Template (optional)"
                value={form.reportTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value as number)}
              >
                <MenuItem value="">None</MenuItem>
                {(templates as Array<{ reportTemplateId: number; templateName: string }> ?? []).map((t) => (
                  <MenuItem key={t.reportTemplateId} value={t.reportTemplateId}>{t.templateName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Microscopic Description"
              multiline
              minRows={8}
              fullWidth
              value={form.synopticData}
              onChange={(e) => setForm({ ...form, synopticData: e.target.value })}
              placeholder="Select a CAP template above, then fill in the fields"
              inputProps={{ 'data-testid': 'synoptic-input', style: { fontFamily: 'monospace', fontSize: 13 } }}
              sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
            />
          </Stack>
        );
      case 'gross':
        return (
          <TextField
            label="Gross Description"
            multiline
            minRows={8}
            fullWidth
            required
            value={form.gross}
            onChange={(e) => setForm({ ...form, gross: e.target.value })}
            inputProps={{ 'data-testid': 'gross-input' }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'clinicalHistory':
        return (
          <Stack spacing={1}>
            <TextField
              label="Clinical History"
              multiline
              minRows={4}
              fullWidth
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              inputProps={{ 'data-testid': 'clinical-history-input' }}
              sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
            />
            <Box display="flex" justifyContent="flex-end">
              <Button
                size="small"
                variant="outlined"
                onClick={() => saveHistoryMutation.mutate()}
                disabled={saveHistoryMutation.isPending}
              >
                {saveHistoryMutation.isPending ? <CircularProgress size={16} /> : 'Save History'}
              </Button>
            </Box>
          </Stack>
        );
      default:
        return null;
    }
  };

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (isLoading || loadingReports)
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );

  const order = orderData?.data as {
    orderId: string;
    caseType?: string;
    registeredDate: string;
    clinicalHistory?: string;
    isReactivated: boolean;
    patient: { lastName: string; firstName: string; patientId: string; dateOfBirth: string; sex: string };
    doctor: { lastName: string; firstName: string };
  } | undefined;

  if (!order) return <Alert severity="error">Order not found</Alert>;

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/result')}>
          Result
        </Link>
        <Typography color="text.primary">{formatOrderIdDisplay(orderId ?? '')}</Typography>
      </Breadcrumbs>

      {/* Case header â€” patient info + accession number */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="flex-start" gap={1} flexWrap="wrap">
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
              <Typography variant="h5" fontWeight={700} data-testid="result-order-id">
                {formatOrderIdDisplay(order.orderId)}
              </Typography>
              {order.isReactivated && <Chip label="Reactivated" color="warning" size="small" />}
              {isSignedOut && <Chip label={`Signed Out v${latestFinal!.versionNumber}`} color="success" size="small" />}
              {latestDraft && <Chip label={`Draft v${latestDraft.versionNumber}`} size="small" />}
              {order.caseType && <Chip label={order.caseType} variant="outlined" size="small" />}
            </Box>
            <Typography variant="body1" fontWeight={600}>
              {order.patient.lastName}, {order.patient.firstName}
            </Typography>
            <Stack direction="row" spacing={2} mt={0.25} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">{order.patient.patientId}</Typography>
              <Typography variant="body2" color="text.secondary">
                DOB: {new Date(order.patient.dateOfBirth).toLocaleDateString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">Sex: {order.patient.sex}</Typography>
              <Typography variant="body2" color="text.secondary">
                Clinician: {order.doctor.lastName}, {order.doctor.firstName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Registered: {new Date(order.registeredDate).toLocaleDateString()}
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Paper>

      {/* Alerts */}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Result Entry" />
        <Tab label="Materials" />
        <Tab label="Report History" />
      </Tabs>

      {/* â”€â”€ Result Entry tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 0 && (
        <>
          {/* Action bar */}
          <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1} mb={2}>
            {isSignedOut ? (
              <>
                <Button
                  href={reportApi.pdfUrl(Number(latestFinal!.reportId))}
                  target="_blank"
                  startIcon={<PictureAsPdf />}
                  variant="outlined"
                  size="small"
                  data-testid="view-report-pdf"
                >
                  View Report PDF
                </Button>
                <Button
                  startIcon={<Refresh />}
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={() => setReactivateDialogOpen(true)}
                  data-testid="reactivate-btn"
                >
                  Reactivate
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                  variant="outlined"
                  size="small"
                  data-testid="save-draft-btn"
                >
                  {saveDraftMutation.isPending ? <CircularProgress size={16} /> : 'Save Draft'}
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Send />}
                  disabled={!canSignOut}
                  onClick={() => setSignOutDialogOpen(true)}
                  data-testid="sign-out-btn"
                >
                  Sign Out
                </Button>
              </>
            )}
          </Box>

          {isSignedOut && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This case is signed out. Use Reactivate to create a revision or addendum.
            </Alert>
          )}

          {/* Draggable / resizable panel grid â€” drag handle to reorder, CSS resize for height */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {panelOrder.map((id, index) => {
              const isLastOdd = index === panelOrder.length - 1 && panelOrder.length % 2 !== 0;
              const isRequired = id === 'diagnosis' || id === 'gross';
              return (
                <Paper
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDrop={(e) => handleDrop(e, id)}
                  onDragEnd={handleDragEnd}
                  sx={{
                    p: 2,
                    gridColumn: isLastOdd ? 'span 2' : undefined,
                    opacity: draggingPanel === id ? 0.4 : 1,
                    outline: dragOverPanel === id ? '2px dashed' : 'none',
                    outlineColor: 'primary.main',
                    resize: 'vertical',
                    overflow: 'auto',
                    minHeight: 180,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={0.5}
                    mb={1.5}
                    sx={{ cursor: 'grab', userSelect: 'none' }}
                  >
                    <DragIndicator fontSize="small" sx={{ color: 'text.disabled' }} />
                    <Typography variant="subtitle2" fontWeight={700}>
                      {PANEL_LABELS[id]}
                      {isRequired && !isSignedOut && (
                        <Typography component="span" color="error.main"> *</Typography>
                      )}
                    </Typography>
                  </Box>
                  {renderPanelContent(id)}
                </Paper>
              );
            })}
          </Box>
        </>
      )}

      {/* â”€â”€ Materials tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Materials</Typography>
          {(((materialsData as { data?: { specimens: unknown[] } })?.data?.specimens ?? []) as Array<{
            specimenId: string;
            specimenCode: string;
            bodySite?: { bodySiteName: string };
            specimenType?: { specimenTypeName: string };
            blocks: Array<{ blockId: string; slides: Array<{ slideId: string; slideType?: string }> }>;
          }>).map((spec) => (
            <Accordion key={spec.specimenId} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>Specimen {spec.specimenCode}</Typography>
                {spec.bodySite && <Chip label={spec.bodySite.bodySiteName} size="small" sx={{ ml: 1 }} />}
              </AccordionSummary>
              <AccordionDetails>
                {spec.blocks.map((block) => (
                  <Box key={block.blockId} mb={1}>
                    <Typography variant="body2" fontWeight={600}>{formatMaterialIdDisplay(block.blockId)}</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                      {block.slides.map((sl) => <Chip key={sl.slideId} label={formatMaterialIdDisplay(sl.slideId)} size="small" />)}
                    </Stack>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </Paper>
      )}

      {/* â”€â”€ Report History tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Report History</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Signed Out</TableCell>
                <TableCell>Pathologist</TableCell>
                <TableCell>PDF</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(reportsData?.data ?? []).map((report) => (
                <TableRow key={Number(report.reportId)}>
                  <TableCell>
                    {report.versionNumber}
                    {report.reactivationType ? ` (${report.reactivationType === 'addend' ? 'Addend' : 'Revision'})` : ''}
                  </TableCell>
                  <TableCell>
                    {report.isFinal
                      ? <Chip label="Final" color="success" size="small" />
                      : <Chip label="Draft" size="small" />}
                  </TableCell>
                  <TableCell>
                    {report.signedOutDatetime ? new Date(report.signedOutDatetime).toLocaleString() : 'â€”'}
                  </TableCell>
                  <TableCell>
                    {report.pathologist ? `${report.pathologist.lastName}, ${report.pathologist.firstName}` : 'â€”'}
                  </TableCell>
                  <TableCell>
                    {report.isFinal && (
                      <Button
                        href={reportApi.pdfUrl(Number(report.reportId))}
                        target="_blank"
                        size="small"
                        startIcon={<PictureAsPdf />}
                      >
                        PDF
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Sign-out confirmation dialog */}
      <Dialog open={signOutDialogOpen} onClose={() => setSignOutDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Sign-Out</DialogTitle>
        <DialogContent>
          <Typography>
            Sign out report for case <strong>{formatOrderIdDisplay(orderId ?? '')}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            This action is final. The report will become immutable once signed out.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSignOutDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => signOutMutation.mutate()}
            variant="contained"
            color="primary"
            disabled={signOutMutation.isPending}
            data-testid="confirm-sign-out-btn"
          >
            {signOutMutation.isPending ? <CircularProgress size={20} /> : 'Sign Out'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog open={reactivateDialogOpen} onClose={() => setReactivateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reactivate Case</DialogTitle>
        <DialogContent>
          <Typography>Reactivating will create a new draft report. Prior reports remain immutable.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReactivateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => reactivateMutation.mutate('revise')}
            variant="outlined"
            color="warning"
            data-testid="reactivate-revise-btn"
          >
            Revise
          </Button>
          <Button
            onClick={() => reactivateMutation.mutate('addend')}
            variant="contained"
            color="warning"
            data-testid="confirm-reactivate-btn"
          >
            Addend
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

