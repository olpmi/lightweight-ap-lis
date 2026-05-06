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
import { ExpandMore, Send, Refresh, PictureAsPdf, DragIndicator, Science } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { orderApi, reportApi, lookupApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useNavigationGuard } from '../hooks/useNavigationGuard';
import {
  formatOrderIdDisplay,
  formatMaterialIdDisplay,
  resolvePatientSummary,
  type PatientSummaryDefinition,
  type PatientSummaryLanguageCode,
  type TemplateCatalogEntry,
  type TemplateDefinition,
} from '@lis/shared';
import StructuredTemplateEditor from '../components/reporting/StructuredTemplateEditor';
import {
  normalizeTemplateDefinition,
  parseStructuredTemplatePayload,
  renderStructuredTemplateText,
  resolveTemplateFormValues,
  serializeStructuredTemplatePayload,
  type RawTemplateDefinition,
  type TemplateFormValues,
} from '../utils/templateForms';

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
  grossPayload?: string;
  synopticData?: string;
  synopticPayload?: string;
  isFinal: boolean;
  isPrelim: boolean;
  reactivationType?: string;
  signedOutDatetime?: string;
  pathologist?: Employee;
  reportTemplate?: { reportTemplateId: number; templateName: string; templateText?: string };
  reportFiles?: Array<{ reportFileId: number | bigint; fileType: string }>;
}

type PanelId = 'diagnosis' | 'comment' | 'synoptic' | 'gross' | 'clinicalHistory';
type ResultTabId = 'result-entry' | 'materials' | 'report-history' | 'patient-summary';

const DEFAULT_PANEL_ORDER: PanelId[] = ['diagnosis', 'comment', 'synoptic', 'gross', 'clinicalHistory'];

export default function ResultCasePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { t, lang, direction, tSite, tOrgan, tCaseType, tSex } = useLanguage();
  const showKeyboardLayoutHint = lang === 'ar' || lang === 'ur';
  const narrativeInputProps = { lang, dir: direction };

  // Panel labels depend on current language — defined inside component
  const PANEL_LABELS: Record<PanelId, string> = {
    diagnosis: t('rc_finalDiagnosis'),
    comment: t('rc_comment'),
    synoptic: t('rc_microscopicDescription'),
    gross: t('rc_grossDescription'),
    clinicalHistory: t('pc_clinicalHistory'),
  };

  const [tab, setTab] = useState<ResultTabId>('result-entry');
  const [form, setForm] = useState({
    diagnosis: '',
    comment: '',
    gross: '',
    grossPayload: '',
    grossTemplateKey: '',
    synopticData: '',
    synopticPayload: '',
    reportTemplateId: '' as number | '',
    reportTemplateKey: '',
  });
  const [templateValues, setTemplateValues] = useState<{ gross: TemplateFormValues; synoptic: TemplateFormValues }>({
    gross: {},
    synoptic: {},
  });
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [signPrelimDialogOpen, setSignPrelimDialogOpen] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivationReason, setReactivationReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [patientSummaryLanguage, setPatientSummaryLanguage] = useState<PatientSummaryLanguageCode>(lang === 'sw' ? 'sw' : 'en');

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

  const { data: reportingTemplates = [] } = useQuery<TemplateCatalogEntry[]>({
    queryKey: ['template-catalog', 'reporting', lang],
    queryFn: () => lookupApi.templateCatalog({ kind: 'reporting', language: lang }),
  });

  const { data: reportingTemplateDefinition, isLoading: reportingTemplateLoading } = useQuery<TemplateDefinition>({
    queryKey: ['template-definition', form.reportTemplateKey, lang],
    queryFn: () => lookupApi.templateDefinition(form.reportTemplateKey, lang),
    enabled: Boolean(form.reportTemplateKey),
  });

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const editableDrafts = reportsData?.data?.filter((r) => !r.isFinal && !r.isPrelim) ?? [];
  const prelims = reportsData?.data?.filter((r) => !r.isFinal && r.isPrelim) ?? [];
  const finalReports = reportsData?.data?.filter((r) => r.isFinal) ?? [];
  const latestDraft = editableDrafts.at(-1);          // active editable draft
  const latestPrelim = prelims.at(-1);                // most recent prelim snapshot
  const latestFinal = finalReports.at(-1);
  const isSignedOut = Boolean(latestFinal && editableDrafts.length === 0);
  const canSignOut = Boolean(form.diagnosis.trim() && form.gross.trim());
  const latestFinalGrossPayload = parseStructuredTemplatePayload(latestFinal?.grossPayload);
  const activeSynopticPayload = parseStructuredTemplatePayload(
    isSignedOut ? latestFinal?.synopticPayload : form.synopticPayload,
  );
  const activePatientSummaryTemplateId = activeSynopticPayload?.templateId ?? '';
  const activeGrossTemplateKey = isSignedOut
    ? (latestFinalGrossPayload?.templateKey ?? '')
    : form.grossTemplateKey;

  const { data: patientSummaryDefinition } = useQuery<PatientSummaryDefinition>({
    queryKey: ['patient-summary-definition', activePatientSummaryTemplateId, patientSummaryLanguage],
    queryFn: () => lookupApi.patientSummaryDefinition(activePatientSummaryTemplateId, patientSummaryLanguage),
    enabled: Boolean(activePatientSummaryTemplateId),
    placeholderData: (previousData) => previousData,
    retry: false,
  });

  const resolvedPatientSummary = resolvePatientSummary(
    patientSummaryDefinition,
    activeSynopticPayload?.values ?? {},
  );
  const hasPatientSummary = Boolean(resolvedPatientSummary);
  const patientSummaryReportId = Number(
    (isSignedOut ? latestFinal?.reportId : latestDraft?.reportId) ?? 0,
  );
  const patientSummaryNeedsDraftSave = Boolean(
    !isSignedOut
    && resolvedPatientSummary
    && (patientSummaryReportId === 0 || latestDraft?.synopticPayload !== form.synopticPayload),
  );
  const canOpenPatientSummaryPdf = Boolean(
    resolvedPatientSummary && (isSignedOut ? patientSummaryReportId > 0 : orderId),
  );

  const { data: grossTemplateDefinition } = useQuery<TemplateDefinition>({
    queryKey: ['template-definition', activeGrossTemplateKey, lang],
    queryFn: () => lookupApi.templateDefinition(activeGrossTemplateKey, lang),
    enabled: Boolean(activeGrossTemplateKey),
  });

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  React.useEffect(() => {
    if (latestDraft && !form.diagnosis && !form.gross) {
      const parsedSynopticPayload = parseStructuredTemplatePayload(latestDraft.synopticPayload);
      const parsedGrossPayload = parseStructuredTemplatePayload(latestDraft.grossPayload);

      setTemplateValues({
        synoptic: parsedSynopticPayload?.values ?? {},
        gross: parsedGrossPayload?.values ?? {},
      });

      setForm({
        diagnosis: latestDraft.diagnosis ?? '',
        comment: latestDraft.comment ?? '',
        gross: latestDraft.gross ?? '',
        grossPayload: latestDraft.grossPayload ?? '',
        grossTemplateKey: parsedGrossPayload?.templateKey ?? '',
        synopticData: latestDraft.synopticData ?? '',
        synopticPayload: latestDraft.synopticPayload ?? '',
        reportTemplateId: latestDraft.reportTemplate?.reportTemplateId ?? '',
        reportTemplateKey: parsedSynopticPayload?.templateKey ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDraft]);

  React.useEffect(() => {
    if (!form.reportTemplateKey || !reportingTemplateDefinition) {
      return;
    }

    const normalizedTemplate = normalizeTemplateDefinition(reportingTemplateDefinition as RawTemplateDefinition);
    const effectiveValues = resolveTemplateFormValues(normalizedTemplate, templateValues.synoptic);
    const nextSynopticData = renderStructuredTemplateText(normalizedTemplate, effectiveValues);
    const nextSynopticPayload = serializeStructuredTemplatePayload(normalizedTemplate, lang, effectiveValues);

    setForm((current) => (
      current.synopticData === nextSynopticData && current.synopticPayload === nextSynopticPayload
        ? current
        : {
            ...current,
            reportTemplateId: '',
            synopticData: nextSynopticData,
            synopticPayload: nextSynopticPayload,
          }
    ));
  }, [form.reportTemplateKey, lang, reportingTemplateDefinition, templateValues.synoptic]);

  React.useEffect(() => {
    if (isSignedOut || !form.grossTemplateKey || !grossTemplateDefinition) {
      return;
    }

    const normalizedTemplate = normalizeTemplateDefinition(grossTemplateDefinition as RawTemplateDefinition);
    const effectiveValues = resolveTemplateFormValues(normalizedTemplate, templateValues.gross);
    const nextGross = renderStructuredTemplateText(normalizedTemplate, effectiveValues);
    const nextGrossPayload = serializeStructuredTemplatePayload(normalizedTemplate, lang, effectiveValues);

    setForm((current) => (
      current.gross === nextGross && current.grossPayload === nextGrossPayload
        ? current
        : {
            ...current,
            gross: nextGross,
            grossPayload: nextGrossPayload,
          }
    ));
  }, [form.grossTemplateKey, grossTemplateDefinition, isSignedOut, lang, templateValues.gross]);

  React.useEffect(() => {
    setPatientSummaryLanguage(lang === 'sw' ? 'sw' : 'en');
  }, [lang]);

  React.useEffect(() => {
    const o = orderData?.data as { clinicalHistory?: string | null } | undefined;
    if (o !== undefined) setClinicalHistory(o.clinicalHistory ?? '');
  }, [orderData]);

  React.useEffect(() => {
    if (tab === 'patient-summary' && !hasPatientSummary) {
      setTab('result-entry');
    }
  }, [hasPatientSummary, tab]);

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const saveHistoryMutation = useMutation({
    mutationFn: () => orderApi.updateClinicalHistory(orderId!, clinicalHistory || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      setSuccess(t('rc_clinicalHistorySaved'));
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('errorGeneric')),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      reportApi.createDraft(orderId!, {
        diagnosis: form.diagnosis || undefined,
        comment: form.comment || undefined,
        gross: form.gross || undefined,
        grossPayload: form.grossPayload || undefined,
        synopticData: form.synopticData || undefined,
        synopticPayload: form.synopticPayload || undefined,
        reportTemplateId: form.reportTemplateId || undefined,
        pathologistEmployeeId: user?.employeeId ? Number(user.employeeId) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      setSuccess(t('rc_draftSaved'));
      setIsDirty(false);
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('errorGeneric')),
  });

  const handleOpenPatientSummaryPdf = async () => {
    if (!resolvedPatientSummary) {
      return;
    }

    setError(null);

    try {
      let reportId = patientSummaryReportId;

      if (patientSummaryNeedsDraftSave) {
        const savedDraft = await saveDraftMutation.mutateAsync();
        reportId = Number((savedDraft as Report).reportId);
      }

      if (reportId <= 0) {
        throw new Error('Save the draft before opening the patient summary PDF.');
      }

      window.open(
        reportApi.patientSummaryPdfUrl(reportId, patientSummaryLanguage),
        '_blank',
        'noopener,noreferrer',
      );
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
          ?? (err instanceof Error ? err.message : t('errorGeneric')),
      );
    }
  };

  const signPrelimMutation = useMutation({
    mutationFn: async () => {
      const pathologistId = user?.employeeId;
      if (!pathologistId) throw new Error('Not authenticated');
      const data = {
        diagnosis: form.diagnosis,
        comment: form.comment || undefined,
        gross: form.gross,
        grossPayload: form.grossPayload || undefined,
        reportTemplateId: form.reportTemplateId || undefined,
        synopticData: form.synopticData || undefined,
        synopticPayload: form.synopticPayload || undefined,
        pathologistEmployeeId: Number(pathologistId),
      };
      let reportId: number;
      if (latestDraft) {
        reportId = Number(latestDraft.reportId);
      } else {
        const created = await reportApi.createDraft(orderId!, data) as { reportId: number | bigint };
        reportId = Number(created.reportId);
      }
      return reportApi.signPrelim(reportId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      setSignPrelimDialogOpen(false);
      setSuccess(t('rc_signedPrelimSuccess'));
      setIsDirty(false);
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('errorGeneric')),
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const pathologistId = user?.employeeId;
      if (!pathologistId) throw new Error('Not authenticated');
      const data = {
        diagnosis: form.diagnosis,
        comment: form.comment || undefined,
        gross: form.gross,
        grossPayload: form.grossPayload || undefined,
        reportTemplateId: form.reportTemplateId || undefined,
        synopticData: form.synopticData || undefined,
        synopticPayload: form.synopticPayload || undefined,
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
      setSuccess(t('rc_signedOutSuccess'));
      setIsDirty(false);
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('errorGeneric')),
  });

  const reactivateMutation = useMutation({
    mutationFn: (reactivationType: 'revise' | 'addend') =>
      reportApi.reactivate(orderId!, reactivationType, reactivationReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', orderId] });
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      setReactivateDialogOpen(false);
      setReactivationReason('');
      setSuccess(t('rc_reactivatedSuccess'));
    },
    onError: (err: unknown) =>
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('errorGeneric')),
  });

  // ── Navigation guard ──────────────────────────────────────────────────────
  const { setDirty, guardedNavigate } = useNavigationGuard();
  React.useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Drag handlers ─────────────────────────────────────────────────────────

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

  const handleStructuredTemplateSelect = (kind: 'synoptic' | 'gross', templateKey: string) => {
    setTemplateValues((current) => ({
      ...current,
      [kind]: {},
    }));

    setForm((current) => (
      kind === 'synoptic'
        ? {
            ...current,
            reportTemplateId: '',
            reportTemplateKey: templateKey,
            synopticPayload: '',
          }
        : {
            ...current,
            grossTemplateKey: templateKey,
            grossPayload: '',
          }
    ));
    setIsDirty(true);
  };

  const handleTemplateValueChange = (kind: 'synoptic' | 'gross', values: TemplateFormValues) => {
    setTemplateValues((current) => ({
      ...current,
      [kind]: values,
    }));
    setIsDirty(true);
  };

  const renderLocalizedTemplateText = (
    definition: TemplateDefinition | undefined,
    values: TemplateFormValues,
    fallback?: string,
  ) => {
    if (!definition) {
      return fallback ?? '';
    }

    const normalizedTemplate = normalizeTemplateDefinition(definition as RawTemplateDefinition);
    const effectiveValues = resolveTemplateFormValues(normalizedTemplate, values);
    return renderStructuredTemplateText(normalizedTemplate, effectiveValues) || fallback || '';
  };

  // â”€â”€ Panel content renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const renderPanelContent = (id: PanelId) => {
    if (isSignedOut) {
      const text =
        id === 'diagnosis' ? latestFinal?.diagnosis :
        id === 'comment' ? latestFinal?.comment :
        id === 'gross' ? renderLocalizedTemplateText(grossTemplateDefinition, latestFinalGrossPayload?.values ?? {}, latestFinal?.gross) :
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
            label={t('rc_finalDiagnosis')}
            multiline
            minRows={6}
            fullWidth
            required
            value={form.diagnosis}
            onChange={(e) => { setForm({ ...form, diagnosis: e.target.value }); setIsDirty(true); }}
            inputProps={{ ...narrativeInputProps, 'data-testid': 'diagnosis-input' }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'comment':
        return (
          <TextField
            label={t('rc_comment')}
            multiline
            minRows={6}
            fullWidth
            value={form.comment}
            onChange={(e) => { setForm({ ...form, comment: e.target.value }); setIsDirty(true); }}
            inputProps={narrativeInputProps}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'synoptic':
        return (
          <StructuredTemplateEditor
            templateLabel={t('rc_reportingTemplate')}
            outputLabel={t('rc_microscopicDescription')}
            placeholder={t('rc_capTemplatePlaceholder')}
            templates={reportingTemplates}
            selectedTemplateKey={form.reportTemplateKey}
            onTemplateKeyChange={(templateKey) => handleStructuredTemplateSelect('synoptic', templateKey)}
            definition={reportingTemplateDefinition as RawTemplateDefinition | undefined}
            values={templateValues.synoptic}
            onValuesChange={(values) => handleTemplateValueChange('synoptic', values)}
            rawText={form.synopticData}
            onRawTextChange={(text) => {
              setForm({
                ...form,
                reportTemplateId: '',
                reportTemplateKey: '',
                synopticPayload: '',
                synopticData: text,
              });
              setTemplateValues((current) => ({ ...current, synoptic: {} }));
              setIsDirty(true);
            }}
            loading={reportingTemplateLoading}
            selectTestId="reporting-template-select"
            outputTestId="synoptic-input"
            loadingText={t('rc_templateLoading')}
            unavailableText={t('rc_templateUnavailable')}
          />
        );
      case 'gross':
        return (
          <TextField
            label={t('rc_grossDescription')}
            multiline
            minRows={8}
            fullWidth
            value={form.gross}
            InputProps={{ readOnly: true }}
            inputProps={{ ...narrativeInputProps, 'data-testid': 'gross-input' }}
            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
          />
        );
      case 'clinicalHistory':
        return (
          <Stack spacing={1}>
            <TextField
              label={t('pc_clinicalHistory')}
              multiline
              minRows={4}
              fullWidth
              value={clinicalHistory}
              onChange={(e) => { setClinicalHistory(e.target.value); setIsDirty(true); }}
              inputProps={{ ...narrativeInputProps, 'data-testid': 'clinical-history-input' }}
              sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
            />
            <Box display="flex" justifyContent="flex-end">
              <Button
                size="small"
                variant="outlined"
                onClick={() => saveHistoryMutation.mutate()}
                disabled={saveHistoryMutation.isPending}
              >
                {saveHistoryMutation.isPending ? <CircularProgress size={16} /> : t('rc_saveHistory')}
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

  if (!order) return <Alert severity="error">{t('errorGeneric')}</Alert>;

  const localizeBodySiteName = (name: string) => {
    const organLabel = tOrgan(name);
    if (organLabel !== name) {
      return organLabel;
    }

    return tSite(name);
  };

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => guardedNavigate('/result')}>
          {t('nav_result')}
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
              {order.isReactivated && <Chip label={t('rq_reactivated')} color="warning" size="small" />}
              {isSignedOut && <Chip label={`${t('rc_signedOut')} v${latestFinal!.versionNumber}`} color="success" size="small" />}
              {latestDraft && <Chip label={`${t('rc_draft')} v${latestDraft.versionNumber}`} size="small" />}
              {order.caseType && <Chip label={tCaseType(order.caseType)} variant="outlined" size="small" />}
            </Box>
            <Typography variant="body1" fontWeight={600}>
              {order.patient.lastName}, {order.patient.firstName}
            </Typography>
            <Stack direction="row" spacing={2} mt={0.25} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">{order.patient.patientId}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('rc_dob')}: {new Date(order.patient.dateOfBirth).toLocaleDateString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('rc_sex')}: {tSex(order.patient.sex)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('oe_clinician')}: {order.doctor.lastName}, {order.doctor.firstName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('pq_registered')}: {new Date(order.registeredDate).toLocaleDateString()}
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Paper>

      {/* Alerts */}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v: ResultTabId) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="result-entry" label={t('rc_resultEntry')} />
        <Tab value="materials" label={t('pc_materials')} />
        <Tab value="report-history" label={t('rc_reportHistory')} />
        {hasPatientSummary && <Tab value="patient-summary" label="Patient Summary" />}
      </Tabs>

      {/* â”€â”€ Result Entry tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'result-entry' && (
        <>
          {/* Action bar */}
          <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1} mb={2}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Science />}
              onClick={() => guardedNavigate(`/processing/${orderId}`)}
              data-testid="open-processing-btn"
            >
              {t('rc_openProcessing')}
            </Button>
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
                  {t('rc_viewReportPdf')}
                </Button>
                <Button
                  startIcon={<Refresh />}
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={() => setReactivateDialogOpen(true)}
                  data-testid="reactivate-btn"
                >
                  {t('rc_reactivate')}
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
                  {saveDraftMutation.isPending ? <CircularProgress size={16} /> : t('rc_saveDraft')}
                </Button>
                {latestPrelim?.reportFiles && (latestPrelim.reportFiles as Array<unknown>).length > 0 && (
                  <Button
                    href={reportApi.pdfUrl(Number(latestPrelim.reportId))}
                    target="_blank"
                    startIcon={<PictureAsPdf />}
                    variant="outlined"
                    size="small"
                  >
                    {t('rc_viewPrelimPdf')}
                  </Button>
                )}
                <Button
                  variant="outlined"
                  color="secondary"
                  disabled={!canSignOut || signPrelimMutation.isPending}
                  onClick={() => setSignPrelimDialogOpen(true)}
                  data-testid="sign-prelim-btn"
                >
                  {signPrelimMutation.isPending ? <CircularProgress size={16} /> : t('rc_signPrelim')}
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Send />}
                  disabled={!canSignOut}
                  onClick={() => setSignOutDialogOpen(true)}
                  data-testid="sign-out-btn"
                >
                  {t('rc_signOut')}
                </Button>
              </>
            )}
          </Box>

          {showKeyboardLayoutHint && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('input_keyboardLayoutHint')}
            </Alert>
          )}

          {isSignedOut && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('rc_signedOutAlert')}
            </Alert>
          )}

          {/* Draggable / resizable panel grid â€” drag handle to reorder, CSS resize for height */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {panelOrder.map((id, index) => {
              const isLastOdd = index === panelOrder.length - 1 && panelOrder.length % 2 !== 0;
              const isRequired = id === 'diagnosis';
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
      {tab === 'materials' && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>{t('pc_materials')}</Typography>
          {(((materialsData as { data?: { specimens: unknown[] } })?.data?.specimens ?? []) as Array<{
            specimenId: string;
            specimenCode: string;
            bodySite?: { bodySiteName: string };
            specimenType?: { specimenTypeName: string };
            blocks: Array<{ blockId: string; slides: Array<{ slideId: string; slideType?: string }> }>;
          }>).map((spec) => (
            <Accordion key={spec.specimenId} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>{t('oe_specimen')} {spec.specimenCode}</Typography>
                {spec.bodySite && <Chip label={localizeBodySiteName(spec.bodySite.bodySiteName)} size="small" sx={{ ml: 1 }} />}
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
      {tab === 'report-history' && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>{t('rc_reportHistory')}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('rc_version')}</TableCell>
                <TableCell>{t('rq_status')}</TableCell>
                <TableCell>{t('rc_signedOut')}</TableCell>
                <TableCell>{t('rc_pathologist')}</TableCell>
                <TableCell>{t('rc_reportPdf')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(reportsData?.data ?? []).map((report) => (
                <TableRow key={Number(report.reportId)}>
                  <TableCell>
                    {report.versionNumber}
                    {report.reactivationType ? ` (${report.reactivationType === 'addend' ? t('rc_addend') : t('rc_revision')})` : ''}
                  </TableCell>
                  <TableCell>
                    {report.isFinal
                      ? <Chip label={t('rc_final')} color="success" size="small" />
                      : report.isPrelim
                        ? <Chip label={t('rc_prelim')} color="warning" size="small" />
                        : <Chip label={t('rc_draft')} size="small" />}
                  </TableCell>
                  <TableCell>
                    {report.signedOutDatetime ? new Date(report.signedOutDatetime).toLocaleString() : '\u2014'}
                  </TableCell>
                  <TableCell>
                    {report.pathologist ? `${report.pathologist.lastName}, ${report.pathologist.firstName}` : '\u2014'}
                  </TableCell>
                  <TableCell>
                    {(report.isFinal || (report.isPrelim && report.reportFiles && report.reportFiles.length > 0)) && (
                      <Button
                        href={reportApi.pdfUrl(Number(report.reportId))}
                        target="_blank"
                        size="small"
                        startIcon={<PictureAsPdf />}
                      >
                        {t('rc_reportPdf')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {tab === 'patient-summary' && resolvedPatientSummary && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={1.5}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Patient Summary
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {resolvedPatientSummary.patientTitle}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                size="small"
                variant={patientSummaryLanguage === 'en' ? 'contained' : 'outlined'}
                onClick={() => setPatientSummaryLanguage('en')}
              >
                EN
              </Button>
              <Button
                size="small"
                variant={patientSummaryLanguage === 'sw' ? 'contained' : 'outlined'}
                onClick={() => setPatientSummaryLanguage('sw')}
              >
                SW
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PictureAsPdf />}
                onClick={() => {
                  void handleOpenPatientSummaryPdf();
                }}
                disabled={!canOpenPatientSummaryPdf || saveDraftMutation.isPending}
              >
                Open PDF
              </Button>
            </Stack>
          </Box>

          <Stack spacing={1.5}>
            <Box>
              <Typography variant="overline" color="text.secondary">Summary</Typography>
              <Typography variant="body2">{resolvedPatientSummary.plainLanguageSummary}</Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">What This Means</Typography>
              <Typography variant="body2">{resolvedPatientSummary.whatThisMeans}</Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">Possible Next Steps</Typography>
              <Typography variant="body2">{resolvedPatientSummary.possibleNextSteps}</Typography>
            </Box>
            <Alert severity="info">{resolvedPatientSummary.safetyNote}</Alert>
          </Stack>
        </Paper>
      )}

      {/* Sign-out confirmation dialog */}
      <Dialog open={signOutDialogOpen} onClose={() => setSignOutDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('rc_confirmSignOut')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('rc_signOut')} <strong>{formatOrderIdDisplay(orderId ?? '')}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            {t('rc_confirmSignOutMsg')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSignOutDialogOpen(false)}>{t('cancel')}</Button>
          <Button
            onClick={() => signOutMutation.mutate()}
            variant="contained"
            color="primary"
            disabled={signOutMutation.isPending}
            data-testid="confirm-sign-out-btn"
          >
            {signOutMutation.isPending ? <CircularProgress size={20} /> : t('rc_signOut')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sign prelim confirmation dialog */}
      <Dialog open={signPrelimDialogOpen} onClose={() => setSignPrelimDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('rc_confirmSignPrelim')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('rc_confirmSignPrelimMsg')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSignPrelimDialogOpen(false)}>{t('cancel')}</Button>
          <Button
            onClick={() => signPrelimMutation.mutate()}
            variant="contained"
            color="secondary"
            disabled={signPrelimMutation.isPending}
          >
            {signPrelimMutation.isPending ? <CircularProgress size={20} /> : t('rc_signPrelim')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog open={reactivateDialogOpen} onClose={() => setReactivateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('rc_reactivateCase')}</DialogTitle>
        <DialogContent>
          <Typography mb={2}>{t('rc_reactivateMsg')}</Typography>
          <TextField
            label={t('rc_reactivateExplanation')}
            placeholder={t('rc_reactivateExplanationPlaceholder')}
            multiline
            minRows={3}
            fullWidth
            required
            value={reactivationReason}
            onChange={(e) => setReactivationReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReactivateDialogOpen(false); setReactivationReason(''); }}>{t('cancel')}</Button>
          <Button
            onClick={() => reactivateMutation.mutate('revise')}
            variant="outlined"
            color="warning"
            disabled={!reactivationReason.trim() || reactivateMutation.isPending}
            data-testid="reactivate-revise-btn"
          >
            {t('rc_revise')}
          </Button>
          <Button
            onClick={() => reactivateMutation.mutate('addend')}
            variant="contained"
            color="warning"
            disabled={!reactivationReason.trim() || reactivateMutation.isPending}
            data-testid="confirm-reactivate-btn"
          >
            {reactivateMutation.isPending ? <CircularProgress size={20} /> : t('rc_addend')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Navigation guard dialog handled by NavigationGuardProvider */}
    </Box>
  );
}

