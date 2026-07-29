import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppLanguageCode, TemplateCatalogEntry } from '@lis/shared';
import { useLanguage } from '../../hooks/useLanguage';
import { configApi, type SaveTemplatePayload } from '../../api';
import { qk } from '../../api/queryKeys';
import {
  normalizeTemplateDefinition,
  resolveTemplateFormValues,
  type RawTemplateDefinition,
  type TemplateFormValues,
} from '../../utils/templateForms';
import StructuredTemplateEditor from '../reporting/StructuredTemplateEditor';

const OVERLAY_LANGS: AppLanguageCode[] = ['fr', 'ar', 'sw', 'ur'];

interface TemplateEditorPanelProps {
  entry: TemplateCatalogEntry;
}

/** Returns a stable empty form values object */
const EMPTY_VALUES: TemplateFormValues = {};

export default function TemplateEditorPanel({ entry }: TemplateEditorPanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'core' | AppLanguageCode>('core');
  const [edits, setEdits] = useState<Partial<Record<'core' | AppLanguageCode, string>>>({});
  const [jsonErrors, setJsonErrors] = useState<Partial<Record<'core' | AppLanguageCode, string>>>({});
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const { data: files, isLoading, error } = useQuery({
    queryKey: qk.configTemplateFiles(entry.templateKey),
    queryFn: () => configApi.getTemplateFiles(entry.templateKey),
  });

  // Initialise edits from loaded files whenever files change or template changes
  useEffect(() => {
    if (!files) return;
    setEdits({
      core: JSON.stringify(files.coreJson, null, 2),
      ...Object.fromEntries(
        OVERLAY_LANGS.map((lang) => [
          lang,
          files.translations[lang] ? JSON.stringify(files.translations[lang], null, 2) : undefined,
        ]).filter(([, v]) => v !== undefined),
      ),
    } as Partial<Record<'core' | AppLanguageCode, string>>);
    setJsonErrors({});
    setActiveTab('core');
  }, [files, entry.templateKey]);

  const handleEditorChange = (value: string | undefined) => {
    const text = value ?? '';
    setEdits((prev) => ({ ...prev, [activeTab]: text }));
    try {
      JSON.parse(text);
      setJsonErrors((prev) => ({ ...prev, [activeTab]: undefined }));
    } catch {
      setJsonErrors((prev) => ({ ...prev, [activeTab]: t('cfg_invalidJson') }));
    }
  };

  const saveMutation = useMutation({
    mutationFn: (payload: SaveTemplatePayload) => configApi.updateTemplate(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.configTemplates });
      void queryClient.invalidateQueries({ queryKey: qk.configTemplateFiles(entry.templateKey) });
      setSnackbar({ open: true, message: t('cfg_saved'), severity: 'success' });
    },
    onError: () => {
      setSnackbar({ open: true, message: t('cfg_saveFailed'), severity: 'error' });
    },
  });

  const handleSave = () => {
    const hasErrors = Object.values(jsonErrors).some(Boolean);
    if (hasErrors) return;

    let coreJson: Record<string, unknown>;
    try {
      coreJson = JSON.parse(edits['core'] ?? '{}') as Record<string, unknown>;
    } catch {
      return;
    }

    const translations: Partial<Record<AppLanguageCode, Record<string, unknown>>> = {};
    for (const lang of OVERLAY_LANGS) {
      const text = edits[lang];
      if (text) {
        try {
          translations[lang] = JSON.parse(text) as Record<string, unknown>;
        } catch {
          // skip invalid
        }
      }
    }

    const title =
      typeof coreJson['title'] === 'string' && coreJson['title']
        ? coreJson['title']
        : entry.title;

    const schemaStyle = Array.isArray(coreJson['sections']) ? 'flat' : 'nested';

    saveMutation.mutate({
      templateKey: entry.templateKey,
      family: entry.family,
      kind: entry.kind,
      schemaStyle,
      title,
      coreJson,
      translations,
    });
  };

  // --- Preview: construct a RawTemplateDefinition from in-memory edits ---
  const previewDefinition = useMemo((): RawTemplateDefinition | undefined => {
    const coreText = edits['core'];
    if (!coreText) return undefined;
    try {
      const core = JSON.parse(coreText) as Record<string, unknown>;
      const previewLang: AppLanguageCode = activeTab === 'core' ? 'en' : activeTab;
      const translText = activeTab !== 'core' ? edits[activeTab] : undefined;
      let translation: Record<string, unknown> | null = null;
      if (translText) {
        try {
          translation = JSON.parse(translText) as Record<string, unknown>;
        } catch {
          translation = null;
        }
      }
      return {
        templateKey: entry.templateKey,
        templateId:
          (typeof core['template_id'] === 'string' ? core['template_id'] : null) ??
          (typeof core['templateId'] === 'string' ? core['templateId'] : null) ??
          entry.templateKey,
        family: entry.family,
        kind: entry.kind,
        schemaStyle: Array.isArray(core['sections']) ? 'flat' : 'nested',
        title: typeof core['title'] === 'string' ? core['title'] : entry.title,
        language: previewLang,
        availableLanguages: entry.availableLanguages,
        core,
        translation,
      };
    } catch {
      return undefined;
    }
  }, [edits, activeTab, entry]);

  const previewValues = useMemo<TemplateFormValues>(() => {
    if (!previewDefinition) return EMPTY_VALUES;
    try {
      const normalized = normalizeTemplateDefinition(previewDefinition);
      return resolveTemplateFormValues(normalized, EMPTY_VALUES);
    } catch {
      return EMPTY_VALUES;
    }
  }, [previewDefinition]);

  const activeTabHasError = !!jsonErrors[activeTab];
  const anyError = Object.values(jsonErrors).some(Boolean);
  const isSaving = saveMutation.isPending;

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={300}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {t('errorGeneric')}
      </Alert>
    );
  }

  const activeEditorValue =
    activeTab === 'core'
      ? (edits['core'] ?? '')
      : (edits[activeTab] ?? '');

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        px={2}
        py={1}
        borderBottom={1}
        borderColor="divider"
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {entry.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {entry.templateKey}
          </Typography>
        </Box>
        <Tooltip title={anyError ? t('cfg_invalidJson') : ''}>
          <span>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              disabled={isSaving || anyError}
              size="small"
            >
              {isSaving ? t('cfg_saving') : t('cfg_save')}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Tab bar */}
      <Box borderBottom={1} borderColor="divider" px={2}>
        <Tabs
          value={activeTab}
          onChange={(_, v: 'core' | AppLanguageCode) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab
            label={
              <Box display="flex" alignItems="center" gap={0.5}>
                {t('cfg_coreTab')}
                {jsonErrors['core'] && (
                  <Chip label="!" size="small" color="error" sx={{ height: 16, fontSize: 10 }} />
                )}
              </Box>
            }
            value="core"
          />
          {OVERLAY_LANGS.map((lang) => {
            const hasContent = !!edits[lang];
            const hasError = !!jsonErrors[lang];
            return (
              <Tab
                key={lang}
                label={
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {lang.toUpperCase()}
                    {hasError && (
                      <Chip label="!" size="small" color="error" sx={{ height: 16, fontSize: 10 }} />
                    )}
                    {!hasContent && !hasError && (
                      <Chip
                        label="+"
                        size="small"
                        variant="outlined"
                        sx={{ height: 16, fontSize: 10, opacity: 0.5 }}
                      />
                    )}
                  </Box>
                }
                value={lang}
              />
            );
          })}
        </Tabs>
      </Box>

      {/* Main body: editor and preview, side by side only when there is room.
          The preview is a fixed 380px that cannot shrink, and this panel already
          sits beside the template tree, so side by side needs roughly 1500px of
          window. Below that the editor was being squeezed to a few pixels — and
          Monaco, which positions its content absolutely, then painted that
          content outside its own box and across the page. Stacked below xl the
          editor gets a usable fixed height and the pane scrolls. */}
      <Box
        display="flex"
        flex={1}
        minHeight={0}
        sx={{
          flexDirection: { xs: 'column', xl: 'row' },
          overflow: { xs: 'auto', xl: 'hidden' },
        }}
      >
        {/* Monaco editor */}
        <Box
          display="flex"
          flexDirection="column"
          flexShrink={0}
          borderColor="divider"
          sx={{
            flex: { xl: 1 },
            minWidth: { xl: 340 },
            height: { xs: 360, xl: 'auto' },
            borderRight: { xl: 1 },
            borderBottom: { xs: 1, xl: 0 },
          }}
        >
          {activeTabHasError && (
            <Alert severity="error" sx={{ m: 1, py: 0 }}>
              {jsonErrors[activeTab]}
            </Alert>
          )}
          <Box flex={1} minHeight={0}>
            <Editor
              language="json"
              value={activeEditorValue}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
              height="100%"
            />
          </Box>
        </Box>

        {/* Preview pane: fixed beside the editor, full width beneath it. */}
        <Box
          flexShrink={0}
          overflow="auto"
          sx={{ bgcolor: 'grey.50', width: { xs: '100%', xl: 380 } }}
          p={1}
        >
          <Typography variant="caption" color="text.secondary" display="block" mb={1} px={1}>
            {t('cfg_preview')}
          </Typography>
          {previewDefinition ? (
            <Paper variant="outlined" sx={{ p: 1 }}>
              <StructuredTemplateEditor
                templateLabel=""
                outputLabel=""
                templates={[entry]}
                selectedTemplateKey={entry.templateKey}
                onTemplateKeyChange={() => undefined}
                definition={previewDefinition}
                values={previewValues}
                onValuesChange={() => undefined}
                rawText=""
                onRawTextChange={() => undefined}
                loadingText={t('rc_templateLoading')}
                unavailableText={t('rc_templateUnavailable')}
              />
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary" px={1}>
              {t('cfg_invalidJson')}
            </Typography>
          )}
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
