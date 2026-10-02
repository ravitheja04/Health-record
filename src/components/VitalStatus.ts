import { labColors } from './LabChart';
import { colors } from './ui';

/** Neutral wording for a reading compared with the typical adult range. */
export const VITAL_STATUS_TEXT = {
  above: { text: 'Above typical', color: labColors.outText },
  below: { text: 'Below typical', color: labColors.outText },
  in: { text: 'In typical range', color: '#166534' },
  none: { text: '', color: colors.muted },
};
