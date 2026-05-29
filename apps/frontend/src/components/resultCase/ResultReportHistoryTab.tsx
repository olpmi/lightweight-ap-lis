import {
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import { reportApi } from '../../api';
import type { TranslationFn } from './types';

// Local report shape — mirrors what ResultCasePage uses (a superset of the
// shared `Report`). Defined here to keep the component self-contained.
export interface ReportRow {
  reportId: number | bigint;
  versionNumber: number;
  isFinal: boolean;
  isPrelim: boolean;
  reactivationType?: string;
  signedOutDatetime?: string;
  pathologist?: { firstName: string; lastName: string };
  reportFiles?: Array<{ reportFileId: number | bigint; fileType: string }>;
}

interface Props {
  reports: ReportRow[];
  t: TranslationFn;
}

export default function ResultReportHistoryTab({ reports, t }: Props) {
  return (
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
          {reports.map((report) => (
            <TableRow key={Number(report.reportId)}>
              <TableCell>
                {report.versionNumber}
                {report.reactivationType
                  ? ` (${report.reactivationType === 'addend' ? t('rc_addend') : t('rc_revision')})`
                  : ''}
              </TableCell>
              <TableCell>
                {report.isFinal
                  ? <Chip label={t('rc_final')} color="success" size="small" />
                  : report.isPrelim
                    ? <Chip label={t('rc_prelim')} color="warning" size="small" />
                    : <Chip label={t('rc_draft')} size="small" />}
              </TableCell>
              <TableCell>
                {report.signedOutDatetime
                  ? new Date(report.signedOutDatetime).toLocaleString()
                  : '\u2014'}
              </TableCell>
              <TableCell>
                {report.pathologist
                  ? `${report.pathologist.lastName}, ${report.pathologist.firstName}`
                  : '\u2014'}
              </TableCell>
              <TableCell>
                {(report.isFinal
                  || (report.isPrelim && report.reportFiles && report.reportFiles.length > 0)) && (
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
  );
}
