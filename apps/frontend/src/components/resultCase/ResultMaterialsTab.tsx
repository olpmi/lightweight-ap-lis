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
import { formatMaterialIdDisplay, type OrderMaterials } from '@lis/shared';
import type { TranslationFn } from './types';

interface Props {
  specimens: OrderMaterials['specimens'];
  blockOrderCounts: Record<string, number>;
  t: TranslationFn;
  localizeBodySiteName: (name: string) => string;
  onOrderAncillary: (blockId: string) => void;
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
            {spec.blocks.map((block) => (
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
                    <Chip key={sl.slideId} label={formatMaterialIdDisplay(sl.slideId)} size="small" />
                  ))}
                </Stack>
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </Paper>
  );
}
