import { labColors } from './LabChart';
import { colors } from './ui';

/** Neutral wording for a reading compared with the typical adult range. */
export const VITAL_STATUS_TEXT = {
  above: {
    text: 'Above typical',
    get color() {
      return labColors.outText;
    },
  },
  below: {
    text: 'Below typical',
    get color() {
      return labColors.outText;
    },
  },
  in: {
    text: 'In typical range',
    get color() {
      return colors.okText;
    },
  },
  none: {
    text: '',
    get color() {
      return colors.muted;
    },
  },
};
