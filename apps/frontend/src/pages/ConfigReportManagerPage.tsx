import React, { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import ArticleIcon from '@mui/icons-material/Article';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../hooks/useLanguage';
import { configReportLayoutApi, type ReportLayout, type UpsertReportLayoutPayload } from '../api';
import apiClient from '../api/client';
import ConfigLayout from '../components/layout/ConfigLayout';

const REPORT_TYPES = ['final', 'preliminary', 'addendum', 'revision'] as const;
type ReportType = typeof REPORT_TYPES[number];

const TYPE_LABELS: Record<ReportType, string> = {
  final: 'Final',
  preliminary: 'Preliminary',
  addendum: 'Addendum',
  revision: 'Revision',
};

const TEMPLATE_VARS = [
  { variable: '{{caseId}}', description: 'Case ID (e.g. SU-26-00001)' },
  { variable: '{{version}}', description: 'Report version number' },
  { variable: '{{reportType}}', description: 'Report type key (final / preliminary / etc.)' },
  { variable: '{{institutionName}}', description: 'Institution name' },
  { variable: '{{patient.lastName}}', description: 'Patient last name' },
  { variable: '{{patient.firstName}}', description: 'Patient first name' },
  { variable: '{{patient.patientId}}', description: 'Patient ID' },
  { variable: '{{patient.dateOfBirth}}', description: 'Date of birth (YYYY-MM-DD)' },
  { variable: '{{patient.sex}}', description: 'Patient sex' },
  { variable: '{{clinician.lastName}}', description: 'Requesting clinician last name' },
  { variable: '{{clinician.firstName}}', description: 'Requesting clinician first name' },
  { variable: '{{clinicalHistory}}', description: 'Clinical history text' },
  { variable: '{{gross}}', description: 'Gross description' },
  { variable: '{{diagnosis}}', description: 'Diagnosis text' },
  { variable: '{{comment}}', description: 'Comment text' },
  { variable: '{{reactivationType}}', description: 'Reactivation type (if amended/revised)' },
  { variable: '{{reactivationReason}}', description: 'Reactivation reason' },
  { variable: '{{signedOutBy}}', description: 'Pathologist who signed out' },
  { variable: '{{signedOutDate}}', description: 'Sign-out date (YYYY-MM-DD)' },
  { variable: '{{#if isPrelim}}...{{/if}}', description: 'Block shown only on preliminary reports' },
  { variable: '{{#if isAddendum}}...{{/if}}', description: 'Block shown only on addendum reports' },
  { variable: '{{#if isRevision}}...{{/if}}', description: 'Block shown only on revised reports' },
  { variable: '{{#if isFinal}}...{{/if}}', description: 'Block shown only on final reports' },
];

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ConfigReportManagerPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [selectedType, setSelectedType] = useState<ReportType>('final');
  const [editName, setEditName] = useState('');
  const [editHtml, setEditHtml] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [varsOpen, setVarsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { data: layouts = [], isLoading } = useQuery({
    queryKey: ['report-layouts'],
    queryFn: configReportLayoutApi.list,
  });

  const layoutMap = useMemo(() => {
    const m: Partial<Record<ReportType, ReportLayout>> = {};
    for (const l of layouts) m[l.reportType as ReportType] = l;
    return m;
  }, [layouts]);

  useEffect(() => {
    const layout = layoutMap[selectedType];
    if (layout) {
      setEditName(layout.name);
      setEditHtml(layout.htmlTemplate);
      setEditActive(layout.isActive);
    } else {
      setEditName(TYPE_LABELS[selectedType] + ' Report');
      setEditHtml('');
      setEditActive(true);
    }
  }, [selectedType, layoutMap]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpsertReportLayoutPayload) => configReportLayoutApi.upsert(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-layouts'] });
      setSnack({ msg: t('rpt_saved'), severity: 'success' });
    },
    onError: () => setSnack({ msg: t('rpt_saveFailed'), severity: 'error' }),
  });

  const resetMutation = useMutation({
    mutationFn: () => configReportLayoutApi.reset(selectedType),
    onSuccess: (layout) => {
      void queryClient.invalidateQueries({ queryKey: ['report-layouts'] });
      setEditName(layout.name);
      setEditHtml(layout.htmlTemplate);
      setEditActive(layout.isActive);
      setResetOpen(false);
      setSnack({ msg: t('rpt_resetDone'), severity: 'success' });
    },
    onError: () => {
      setResetOpen(false);
      setSnack({ msg: t('rpt_saveFailed'), severity: 'error' });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      reportType: selectedType,
      name: editName,
      htmlTemplate: editHtml,
      isActive: editActive,
    });
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const response = await apiClient.post(
        configReportLayoutApi.previewUrl(selectedType),
        { htmlTemplate: editHtml },
        { responseType: 'blob' },
      );
      const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      setSnack({ msg: 'Failed to generate preview', severity: 'error' });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <ConfigLayout>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
        {/* Sidebar â€” one row per report type */}
        <Box
          sx={{
            width: 220,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              px: 2,
              py: 1.5,
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontSize: 11,
            }}
          >
            {t('rpt_title')}
          </Typography>
          <Divider />
          <List dense disablePadding>
            {REPORT_TYPES.map((rt) => {
              const layout = layoutMap[rt];
              return (
                <ListItemButton
                  key={rt}
                  selected={selectedType === rt}
                  onClick={() => setSelectedType(rt)}
                  sx={{ px: 2, py: 1.5 }}
                >
                  <ListItemText
                    primary={TYPE_LABELS[rt]}
                    secondary={layout?.name ?? 'â€”'}
                    primaryTypographyProps={{ fontWeight: selectedType === rt ? 700 : 400 }}
                    secondaryTypographyProps={{ noWrap: true, fontSize: 11 }}
                  />
                  {layout && (
                    <Chip
                      label={layout.isActive ? 'active' : 'off'}
                      size="small"
                      color={layout.isActive ? 'success' : 'default'}
                      sx={{ ml: 0.5, height: 18, fontSize: 10 }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </List>
        </Box>

        {/* Editor panel */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Toolbar */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  flexWrap: 'wrap',
                }}
              >
                <TextField
                  size="small"
                  label={t('rpt_layoutName')}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  sx={{ width: 280 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                  }
                  label={t('rpt_active')}
                />
                <Box sx={{ flex: 1 }} />
                <Tooltip title={t('rpt_previewNote')}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        previewing ? <CircularProgress size={14} /> : <PictureAsPdfIcon />
                      }
                      onClick={handlePreview}
                      disabled={previewing || !editHtml}
                    >
                      {t('rpt_preview')}
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<RefreshIcon />}
                  onClick={() => setResetOpen(true)}
                >
                  {t('rpt_reset')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={
                    saveMutation.isPending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <SaveIcon />
                    )
                  }
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {t('rpt_save')}
                </Button>
              </Box>

              {/* Template variables accordion */}
              <Box
                sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    py: 0.5,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => setVarsOpen((v) => !v)}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, mr: 1, color: 'text.secondary' }}
                  >
                    {t('rpt_templateVars')}
                  </Typography>
                  <IconButton size="small">
                    {varsOpen ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>
                </Box>
                <Collapse in={varsOpen}>
                  <Box sx={{ px: 2, pb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {TEMPLATE_VARS.map(({ variable, description }) => (
                      <Tooltip key={variable} title={description} placement="top">
                        <Chip
                          label={variable}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: 'monospace', fontSize: 11, cursor: 'default' }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                </Collapse>
              </Box>

              {/* Monaco editor */}
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                  height="100%"
                  language="html"
                  value={editHtml}
                  onChange={(v) => setEditHtml(v ?? '')}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    tabSize: 2,
                    lineNumbers: 'on',
                  }}
                  theme="vs"
                />
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Reset confirm dialog */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)}>
        <DialogTitle>{t('rpt_reset')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('rpt_resetConfirm')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {t('rpt_reset')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </ConfigLayout>
  );
}
