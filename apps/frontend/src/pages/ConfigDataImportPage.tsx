import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Download, UploadFile } from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import {
  DATA_IMPORT_ENTITIES,
  IMPORT_COLUMNS,
  type DataImportEntity,
  type ImportPreview,
  type ImportResult,
  type ImportRowAction,
} from '@lis/shared';
import ConfigLayout from '../components/layout/ConfigLayout';
import { useLanguage } from '../hooks/useLanguage';
import { dataImportApi } from '../api';

type TKey = Parameters<ReturnType<typeof useLanguage>['t']>[0];

const ENTITY_LABEL_KEYS: Record<DataImportEntity, TKey> = {
  patients: 'imp_entityPatients',
  doctors: 'imp_entityDoctors',
  staff: 'imp_entityStaff',
};

const ACTION_LABEL_KEYS: Record<ImportRowAction, TKey> = {
  create: 'imp_actionCreate',
  skip: 'imp_actionSkip',
  error: 'imp_actionError',
};

const REASON_LABEL_KEYS: Record<string, TKey> = {
  ALREADY_EXISTS: 'imp_reasonAlreadyExists',
  DUPLICATE_IN_FILE: 'imp_reasonDuplicateInFile',
};

/** Pull the API's structured error out of an axios rejection. */
function apiError(err: unknown): { message: string; preview?: ImportPreview } {
  const body = (
    err as {
      response?: {
        data?: { error?: { message?: string; details?: { preview?: ImportPreview } } };
      };
    }
  )?.response?.data?.error;
  return { message: body?.message ?? 'Import failed', preview: body?.details?.preview };
}

export default function ConfigDataImportPage() {
  const { t } = useLanguage();

  const [entity, setEntity] = useState<DataImportEntity>('patients');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Any change to what is being imported invalidates the report on screen.
   * Without this a user could validate one file, pick another, and commit the
   * second on the strength of the first one's green tick.
   */
  const clearReport = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const previewMutation = useMutation({
    mutationFn: () => dataImportApi.preview(entity, csv ?? ''),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
      setError(null);
    },
    onError: (err) => {
      const { message, preview: reported } = apiError(err);
      setPreview(reported ?? null);
      setError(message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => dataImportApi.commit(entity, csv ?? ''),
    onSuccess: (data) => {
      setResult(data);
      setPreview(data);
      setError(null);
    },
    onError: (err) => {
      const { message, preview: reported } = apiError(err);
      if (reported) setPreview(reported);
      setError(message);
    },
  });

  const handleEntityChange = (_: React.MouseEvent<HTMLElement>, next: DataImportEntity | null) => {
    if (!next) return;
    setEntity(next);
    setFileName(null);
    setCsv(null);
    clearReport();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    clearReport();
  };

  const spec = IMPORT_COLUMNS[entity];
  const busy = previewMutation.isPending || commitMutation.isPending;

  return (
    <ConfigLayout>
      <Box p={3} height="100%" sx={{ overflowY: 'auto' }}>
        <Typography variant="h6" gutterBottom>
          {t('imp_title')}
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('imp_intro')}
        </Alert>

        {/* 1 — what to import */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <ToggleButtonGroup
            value={entity}
            exclusive
            onChange={handleEntityChange}
            size="small"
            sx={{ mb: 2 }}
          >
            {DATA_IMPORT_ENTITIES.map((option) => (
              <ToggleButton key={option} value={option} data-testid={`import-entity-${option}`}>
                {t(ENTITY_LABEL_KEYS[option])}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Typography variant="subtitle2" gutterBottom>
            {t('imp_expectedColumns')}
          </Typography>
          <TableContainer sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('imp_column')}</TableCell>
                  <TableCell>{t('imp_notes')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {spec.all.map((column) => (
                  <TableRow key={column}>
                    <TableCell>
                      <code>{column}</code>
                    </TableCell>
                    <TableCell>
                      {spec.required.includes(column) ? t('imp_required') : t('imp_optional')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {entity === 'patients' && (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="import-patient-id-hint">
              {t('imp_patientIdHint')}
            </Alert>
          )}

          {entity === 'staff' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t('imp_staffPasswordHint')}
            </Alert>
          )}

          <Button
            component="a"
            href={`/csv-templates/${entity}.csv`}
            download
            startIcon={<Download />}
            size="small"
          >
            {t('imp_downloadExample')}
          </Button>
        </Paper>

        {/* 2 — choose a file and validate */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button component="label" variant="outlined" startIcon={<UploadFile />}>
              {t('imp_chooseFile')}
              <input type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {fileName ?? t('imp_noFileChosen')}
            </Typography>
            <Button
              variant="contained"
              disabled={!csv || busy}
              onClick={() => previewMutation.mutate()}
              data-testid="import-validate"
            >
              {previewMutation.isPending ? t('imp_validating') : t('imp_validate')}
            </Button>
            {busy && <CircularProgress size={20} />}
          </Stack>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* 3 — validation report */}
        {preview && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
              <Chip color="success" label={`${preview.counts.create} ${t('imp_toCreate')}`} />
              <Chip label={`${preview.counts.skip} ${t('imp_toSkip')}`} />
              <Chip
                color={preview.counts.error > 0 ? 'error' : 'default'}
                label={`${preview.counts.error} ${t('imp_errors')}`}
              />
            </Stack>

            {preview.counts.error > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {t('imp_fixErrors')}
              </Alert>
            )}

            {preview.errors.length > 0 && (
              <TableContainer sx={{ mb: 2, maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('imp_line')}</TableCell>
                      <TableCell>{t('imp_column')}</TableCell>
                      <TableCell>{t('imp_message')}</TableCell>
                      <TableCell>{t('imp_value')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.errors.map((issue, index) => (
                      <TableRow key={`${issue.line}-${issue.column ?? ''}-${index}`}>
                        <TableCell>{issue.line}</TableCell>
                        <TableCell>{issue.column ?? '—'}</TableCell>
                        <TableCell>{issue.message}</TableCell>
                        <TableCell>{issue.value ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Typography variant="subtitle2" gutterBottom>
              {t('imp_rowsPreview')}
            </Typography>
            <TableContainer sx={{ mb: 2, maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('imp_line')}</TableCell>
                    <TableCell>{t('imp_action')}</TableCell>
                    <TableCell>{t('imp_record')}</TableCell>
                    <TableCell>{t('imp_reason')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell>{row.line}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={row.action === 'create' ? 'success' : 'default'}
                          label={t(ACTION_LABEL_KEYS[row.action])}
                        />
                      </TableCell>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>
                        {row.reason ? t(REASON_LABEL_KEYS[row.reason] ?? 'imp_reason') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {preview.truncated && (
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                {t('imp_truncated')}
              </Typography>
            )}

            <Button
              variant="contained"
              color="primary"
              disabled={!preview.canCommit || busy || result !== null}
              onClick={() => commitMutation.mutate()}
              data-testid="import-commit"
            >
              {commitMutation.isPending ? t('imp_importing') : t('imp_import')}
            </Button>
          </Paper>
        )}

        {/* 4 — outcome */}
        {result && (
          <Alert severity="success" data-testid="import-result">
            {t('imp_done')} — {result.created} {t('imp_created')}, {result.skipped}{' '}
            {t('imp_skipped')}
          </Alert>
        )}
      </Box>
    </ConfigLayout>
  );
}
