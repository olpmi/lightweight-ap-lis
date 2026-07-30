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
  const { tIn } = useLanguage();

  // Everything the patient sees follows the summary's language, not the
  // interface's: the summary is written for the patient, and a Kiswahili summary
  // under English headings is neither one thing nor the other. That includes the
  // PDF actions, since the PDF they produce is the document handed to the patient.
  // Only the EN/SW codes on the language toggle stay as they are — they name the
  // languages themselves, so translating them would defeat the purpose.
  const tPatient = (key: Parameters<typeof tIn>[1]) => tIn(patientSummaryLanguage, key);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={1.5}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">{tPatient('ps_title')}</Typography>
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
            {tPatient('ps_openPdf')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download />}
            onClick={onDownloadPdf}
            disabled={!canOpenPdf || pdfPending}
          >
            {tPatient('ps_downloadPdf')}
          </Button>
        </Stack>
      </Box>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="overline" color="text.secondary">{tPatient('ps_summary')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.plainLanguageSummary}</Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">{tPatient('ps_whatThisMeans')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.whatThisMeans}</Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">{tPatient('ps_possibleNextSteps')}</Typography>
          <Typography variant="body2">{resolvedPatientSummary.possibleNextSteps}</Typography>
        </Box>
        <Alert severity="info">{resolvedPatientSummary.safetyNote}</Alert>
      </Stack>
    </Paper>
  );
}
