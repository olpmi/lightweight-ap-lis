import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import type {
  PatientSummaryLanguageCode,
  resolvePatientSummary,
} from '@lis/shared';
import { useLanguage } from '../../hooks/useLanguage';

type ResolvedPatientSummary = NonNullable<ReturnType<typeof resolvePatientSummary>>;

interface Props {
  resolvedPatientSummary: ResolvedPatientSummary;
  patientSummaryLanguage: PatientSummaryLanguageCode;
  onChangeLanguage: (lang: PatientSummaryLanguageCode) => void;
  canOpenPdf: boolean;
  pdfPending: boolean;
  onOpenPdf: () => void;
}

export default function ResultPatientSummaryTab({
  resolvedPatientSummary,
  patientSummaryLanguage,
  onChangeLanguage,
  canOpenPdf,
  pdfPending,
  onOpenPdf,
}: Props) {
  const { t } = useLanguage();
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={1.5}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">{t('ps_title')}</Typography>
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
