import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Download, PictureAsPdf } from '@mui/icons-material';
import type {
  PatientSummaryLanguageCode,
  ResolvedPatientSummary,
} from '@lis/shared';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  resolvedPatientSummary: ResolvedPatientSummary;
  patientSummaryLanguage: PatientSummaryLanguageCode;
  onChangeLanguage: (lang: PatientSummaryLanguageCode) => void;
  canOpenPdf: boolean;
  pdfPending: boolean;
  onOpenPdf: () => void;
  onDownloadPdf: () => void;
}

export default function ResultPatientSummaryTab({
  resolvedPatientSummary,
  patientSummaryLanguage,
  onChangeLanguage,
  canOpenPdf,
  pdfPending,
  onOpenPdf,
  onDownloadPdf,
}: Props) {
  const { t } = useLanguage();
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={1.5}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">{t('ps_title')}</Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {resolvedPatientSummary.professionalLabel}
          </Typography>
          <Typography variant="h6" fontWeight={700}>{resolvedPatientSummary.patientTitle}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            size="small"
            variant={patientSummaryLanguage === 'en' ? 'contained' : 'outlined'}
            onClick={() => onChangeLanguage('en')}
          >
            EN
          </Button>
          <Button
            size="small"
            variant={patientSummaryLanguage === 'sw' ? 'contained' : 'outlined'}
            onClick={() => onChangeLanguage('sw')}
          >
            SW
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={onOpenPdf}
            disabled={!canOpenPdf || pdfPending}
          >
            {t('ps_openPdf')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download />}
            onClick={onDownloadPdf}
            disabled={!canOpenPdf || pdfPending}
          >
            {t('ps_downloadPdf')}
          </Button>
        </Stack>
      </Box>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="overline" color="text.secondary">{t('ps_summary')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.plainLanguageSummary}</Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">{t('ps_whatThisMeans')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.whatThisMeans}</Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">{t('ps_possibleNextSteps')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.possibleNextSteps}</Typography>
        </Box>
        <Alert severity="info">{resolvedPatientSummary.safetyNote}</Alert>
      </Stack>
    </Paper>
  );
}
