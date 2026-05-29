import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Biotech } from '@mui/icons-material';
import { formatMaterialIdDisplay } from '@lis/shared';
import type { AncillaryOrder, AncillaryOrderStatus } from '@lis/shared';
import type { TranslationFn } from './types';

interface Props {
  ancillaryOrders: AncillaryOrder[];
  t: TranslationFn;
  onOrderNew: () => void;
  onOrderForBlock: (blockId: string) => void;
  onCancelOrder: (id: number) => void;
  cancelPending: boolean;
}

// Color map for the histology + sendout pipelines:
//   PULL_BLOCK / PULL_MATERIAL              — queued, not yet started   → warning
//   MICROTOMY / SLIDE_STAIN / MATERIAL_SENT — in flight                 → info
//   DISTRIBUTED / MATERIAL_RETURNED         — terminal success          → success
//   CANCELLED                               — terminal cancellation     → error
function statusColor(s: AncillaryOrderStatus): 'default' | 'warning' | 'info' | 'success' | 'error' {
  switch (s) {
    case 'PULL_BLOCK':
    case 'PULL_MATERIAL':
      return 'warning';
    case 'MICROTOMY':
    case 'SLIDE_STAIN':
    case 'MATERIAL_SENT':
      return 'info';
    case 'DISTRIBUTED':
    case 'MATERIAL_RETURNED':
      return 'success';
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
}

function isTerminal(s: AncillaryOrderStatus): boolean {
  return s === 'DISTRIBUTED' || s === 'MATERIAL_RETURNED' || s === 'CANCELLED';
}

export default function ResultAncillaryTab({
  ancillaryOrders,
  t,
  onOrderNew,
  onOrderForBlock,
  onCancelOrder,
  cancelPending,
}: Props) {
  const statusLabel = (s: AncillaryOrderStatus) => t(`anc_status_${s}`);

  const grouped = ancillaryOrders.reduce<Record<string, AncillaryOrder[]>>((acc, o) => {
    if (!acc[o.blockId]) acc[o.blockId] = [];
    acc[o.blockId].push(o);
    return acc;
  }, {});

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle1" fontWeight={700}>{t('rc_ancillaryTab')}</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<Biotech />}
          onClick={onOrderNew}
        >
          {t('anc_orderNewTest')}
        </Button>
      </Box>
      {ancillaryOrders.length === 0 ? (
        <Typography color="text.secondary">{t('anc_noOrders')}</Typography>
      ) : (
        Object.entries(grouped).map(([blockId, blkOrders]) => (
          <Box key={blockId} mb={2}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Chip label={formatMaterialIdDisplay(blockId)} size="small" variant="outlined" />
              <Button
                size="small"
                startIcon={<Biotech />}
                onClick={() => onOrderForBlock(blockId)}
              >
                {t('anc_orderAncillary')}
              </Button>
            </Box>
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <TableCell>Test</TableCell>
                  <TableCell>{t('anc_category')}</TableCell>
                  <TableCell>{t('anc_status')}</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {blkOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Typography variant="body2">
                        {o.orderable?.name ?? `#${o.orderableId}`}
                        {o.levelCount ? ` ×${o.levelCount}` : ''}
                      </Typography>
                      {o.notes && (
                        <Typography variant="caption" color="text.secondary">
                          {o.notes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={o.orderable ? t(`anc_cat_${o.orderable.category}`) : '\u2014'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={statusLabel(o.status)} color={statusColor(o.status)} size="small" />
                      <Typography variant="caption" display="block" color="text.secondary" mt={0.25}>
                        {(() => {
                          // Pick the most informative timestamp for the current state.
                          const ts = o.status === 'CANCELLED'
                            ? (o.cancelledAt ?? o.orderedAt)
                            : (o.status === 'DISTRIBUTED' || o.status === 'MATERIAL_RETURNED')
                              ? (o.completedAt ?? o.orderedAt)
                              : o.orderedAt;
                          return ts
                            ? new Date(ts).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : null;
                        })()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {/*
                          Workflow advancement (Pull Block → Microtomy → …) and
                          reactivation belong on the Histology / Ancillary queue
                          pages. From the result-case view the pathologist can
                          only cancel an in-flight order.
                        */}
                        {!isTerminal(o.status) && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => onCancelOrder(o.id)}
                            disabled={cancelPending}
                          >
                            {t('anc_cancel')}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ))
      )}
    </Paper>
  );
}
