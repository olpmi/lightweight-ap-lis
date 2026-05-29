import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Biotech, ExpandMore } from '@mui/icons-material';
import { formatMaterialIdDisplay, type AncillaryOrderStatus, type OrderMaterials } from '@lis/shared';
import type { TranslationFn } from './types';

interface Props {
  specimens: OrderMaterials['specimens'];
  blockOrderCounts: Record<string, number>;
  t: TranslationFn;
  localizeBodySiteName: (name: string) => string;
  onOrderAncillary: (blockId: string) => void;
}

type SlideStatus = 'MICROTOMY' | 'SLIDE_STAIN' | 'DISTRIBUTED';

const SLIDE_STATUS_COLOR: Record<SlideStatus, 'warning' | 'info' | 'success'> = {
  MICROTOMY: 'warning',
  SLIDE_STAIN: 'info',
  DISTRIBUTED: 'success',
};

function deriveSlideStatus(
  ancillaryOrders: Array<{ status: AncillaryOrderStatus }> | undefined,
): SlideStatus {
  // Slide status mirrors the parent block's HE ancillary order (the histology
  // workflow). The backend filters `ancillaryOrders` to category HE in
  // queue.service.getOrderMaterials, and block creation auto-creates exactly
  // one HE order per block, so we read the first non-cancelled entry.
  const he = ancillaryOrders?.find((o) => o.status !== 'CANCELLED');
  switch (he?.status) {
    case 'SLIDE_STAIN':
      return 'SLIDE_STAIN';
    case 'DISTRIBUTED':
      return 'DISTRIBUTED';
    default:
      return 'MICROTOMY';
  }
}

export default function ResultMaterialsTab({
  specimens,
  blockOrderCounts,
  t,
  localizeBodySiteName,
  onOrderAncillary,
}: Props) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} mb={2}>{t('pc_materials')}</Typography>
      {specimens.map((spec) => (
        <Accordion key={spec.specimenId} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography fontWeight={600}>{t('oe_specimen')} {spec.specimenCode}</Typography>
            {spec.bodySite && (
              <Chip
                label={localizeBodySiteName(spec.bodySite.bodySiteName)}
                size="small"
                sx={{ ml: 1 }}
              />
            )}
          </AccordionSummary>
          <AccordionDetails>
            {spec.blocks.map((block) => {
              const slideStatus = deriveSlideStatus(block.ancillaryOrders);
              const slideStatusLabel = t(`anc_status_${slideStatus}`);
              const slideStatusColor = SLIDE_STATUS_COLOR[slideStatus];
              return (
                <Box key={block.blockId} mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {formatMaterialIdDisplay(block.blockId)}
                    </Typography>
                    {(blockOrderCounts[block.blockId] ?? 0) > 0 && (
                      <Chip
                        label={blockOrderCounts[block.blockId]}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                    <IconButton
                      size="small"
                      title={t('anc_orderAncillary')}
                      onClick={() => onOrderAncillary(block.blockId)}
                    >
                      <Biotech fontSize="small" />
                    </IconButton>
                  </Box>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                    {block.slides.map((sl) => (
                      <Chip
                        key={sl.slideId}
                        label={`${formatMaterialIdDisplay(sl.slideId)} · ${slideStatusLabel}`}
                        size="small"
                        color={slideStatusColor}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </AccordionDetails>
        </Accordion>
      ))}
    </Paper>
  );
}
