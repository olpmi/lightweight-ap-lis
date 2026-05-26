import React, { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import type { TemplateCatalogEntry } from '@lis/shared';
import { useLanguage } from '../../hooks/useLanguage';
import { configApi, type SaveTemplatePayload } from '../../api';

interface CreateTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  catalog: TemplateCatalogEntry[];
  onCreated: (templateKey: string) => void;
}

const BLANK_CORE_SKELETON = {
  template_id: '',
  title: '',
  domain: 'anatomic_pathology',
  sections: [],
};

function buildClonedCore(
  _entry: TemplateCatalogEntry,
  coreJson: Record<string, unknown>,
): Record<string, unknown> {
  return { ...coreJson, template_id: '', templateId: undefined, title: '' };
}

/** All unique directory paths from the catalog (every intermediate path segment) */
function extractDirs(catalog: TemplateCatalogEntry[]): string[] {
  const dirs = new Set<string>();
  for (const entry of catalog) {
    const parts = entry.templateKey.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }
  return Array.from(dirs).sort();
}

export default function CreateTemplateDialog({
  open,
  onClose,
  catalog,
  onCreated,
}: CreateTemplateDialogProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'blank' | 'clone'>('blank');
  const [cloneSource, setCloneSource] = useState<TemplateCatalogEntry | null>(null);

  // Filesystem-style path inputs
  const [dirPath, setDirPath] = useState('');
  const [fileName, setFileName] = useState('');

  const [kind, setKind] = useState<'gross' | 'reporting'>('reporting');
  const [family, setFamily] = useState('');
  const [coreJsonText, setCoreJsonText] = useState(JSON.stringify(BLANK_CORE_SKELETON, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const dirs = useMemo(() => extractDirs(catalog), [catalog]);

  // Computed full templateKey
  const templateKey = dirPath.trim()
    ? `${dirPath.trim()}/${fileName.trim()}`
    : fileName.trim();

  const fileNameError = fileName.includes('/') ? `${t('cfg_filename')} cannot contain /` : '';
  const step1Valid = fileName.trim().length > 0 && !fileName.includes('/') && family.trim().length > 0;

  const handleDirChange = (value: string) => {
    setDirPath(value);
    // Auto-fill family from the first path segment
    const first = value.split('/')[0] ?? '';
    if (first) setFamily(first);
  };

  const handleLoadCloneSource = async (entry: TemplateCatalogEntry | null) => {
    setCloneSource(entry);
    if (!entry) {
      setCoreJsonText(JSON.stringify(BLANK_CORE_SKELETON, null, 2));
      return;
    }
    try {
      const files = await configApi.getTemplateFiles(entry.templateKey);
      setCoreJsonText(JSON.stringify(buildClonedCore(entry, files.coreJson), null, 2));
      setKind(entry.kind as 'gross' | 'reporting');
      // Pre-fill directory from clone source path
      const parts = entry.templateKey.split('/');
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join('/');
        setDirPath(dir);
        setFamily(parts[0] ?? entry.family);
      }
    } catch {
      setCoreJsonText(JSON.stringify(BLANK_CORE_SKELETON, null, 2));
    }
  };

  const handleModeChange = (value: 'blank' | 'clone') => {
    setMode(value);
    if (value === 'blank') {
      setCoreJsonText(JSON.stringify(BLANK_CORE_SKELETON, null, 2));
      setCloneSource(null);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const text = value ?? '';
    setCoreJsonText(text);
    try {
      JSON.parse(text);
      setJsonError('');
    } catch {
      setJsonError(t('cfg_invalidJson'));
    }
  };

  const handleNext = () => {
    if (step === 0 && step1Valid) setStep(1);
  };

  const handleCreate = async () => {
    if (jsonError || !step1Valid) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(coreJsonText) as Record<string, unknown>;
    } catch {
      setJsonError(t('cfg_invalidJson'));
      return;
    }

    const schemaStyle = Array.isArray(parsed['sections']) ? 'flat' : 'nested';
    const title =
      typeof parsed['title'] === 'string' && parsed['title'] ? parsed['title'] : templateKey;

    const payload: SaveTemplatePayload = {
      templateKey,
      family: family.trim(),
      kind,
      schemaStyle,
      title,
      coreJson: parsed,
      translations: {},
    };

    setSaving(true);
    setSaveError('');
    try {
      await configApi.createTemplate(payload);
      onCreated(templateKey);
      handleClose();
    } catch {
      setSaveError(t('cfg_createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setMode('blank');
    setCloneSource(null);
    setDirPath('');
    setFileName('');
    setFamily('');
    setKind('reporting');
    setCoreJsonText(JSON.stringify(BLANK_CORE_SKELETON, null, 2));
    setJsonError('');
    setSaveError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('cfg_new')}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          <Step><StepLabel>{t('cfg_step1Setup')}</StepLabel></Step>
          <Step><StepLabel>{t('cfg_step2Edit')}</StepLabel></Step>
        </Stepper>

        {step === 0 && (
          <Box display="flex" flexDirection="column" gap={2.5}>
            <RadioGroup
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as 'blank' | 'clone')}
              row
            >
              <FormControlLabel value="blank" control={<Radio />} label={t('cfg_blank')} />
              <FormControlLabel value="clone" control={<Radio />} label={t('cfg_cloneExisting')} />
            </RadioGroup>

            {mode === 'clone' && (
              <Autocomplete
                options={catalog}
                getOptionLabel={(o) => `${o.templateKey} â€” ${o.title}`}
                value={cloneSource}
                onChange={(_, v) => void handleLoadCloneSource(v)}
                renderInput={(params) => (
                  <TextField {...params} label={t('cfg_cloneSource')} size="small" />
                )}
              />
            )}

            {/* Filesystem path builder */}
            <Box
              sx={{
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5} fontWeight={600}>
                {t('cfg_templateKey')}
              </Typography>
              <Box display="flex" flexDirection="column" gap={1.5}>
                <Autocomplete
                  freeSolo
                  options={dirs}
                  value={dirPath}
                  onInputChange={(_, value) => handleDirChange(value)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('cfg_directory')}
                      size="small"
                      placeholder="e.g. breast.histology/breast/reporting"
                    />
                  )}
                />
                <TextField
                  label={t('cfg_filename')}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  size="small"
                  required
                  error={!!fileNameError}
                  helperText={fileNameError || undefined}
                  placeholder="e.g. my_new_template"
                />
              </Box>
              {/* Path preview */}
              <Box
                mt={1.5}
                px={1}
                py={0.75}
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: 0.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {'-> '}
                  <Box
                    component="span"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: templateKey ? 'text.primary' : 'text.disabled',
                    }}
                  >
                    {templateKey
                      ? `${templateKey}.core.json`
                      : '<directory>/<filename>.core.json'}
                  </Box>
                </Typography>
              </Box>
            </Box>

            <Box display="flex" gap={2}>
              <TextField
                label={t('cfg_family')}
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                size="small"
                required
                sx={{ flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>{t('cfg_kind')}</InputLabel>
                <Select
                  value={kind}
                  label={t('cfg_kind')}
                  onChange={(e) => setKind(e.target.value as 'gross' | 'reporting')}
                >
                  <MenuItem value="gross">{t('cfg_gross')}</MenuItem>
                  <MenuItem value="reporting">{t('cfg_reporting')}</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              mb={1}
              sx={{ fontFamily: 'monospace' }}
            >
              {templateKey}.core.json
            </Typography>
            <Box border={1} borderColor="divider" borderRadius={1} overflow="hidden" height={400}>
              <Editor
                language="json"
                value={coreJsonText}
                onChange={handleEditorChange}
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                height={400}
              />
            </Box>
            {jsonError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {jsonError}
              </Alert>
            )}
          </Box>
        )}

        {saveError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {saveError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          {t('cancel')}
        </Button>
        {step === 0 && (
          <Button onClick={handleNext} variant="contained" disabled={!step1Valid}>
            {t('cfg_step2Edit')}
          </Button>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)} disabled={saving}>
              {t('cfg_step1Setup')}
            </Button>
            <Button
              onClick={() => void handleCreate()}
              variant="contained"
              disabled={saving || !!jsonError}
            >
              {saving ? t('cfg_saving') : t('cfg_create')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
