import { labColors } from './LabChart';
import { colors } from './ui';
import { t } from '@/i18n';

/** Neutral wording for a reading compared with the typical adult range. */
export const VITAL_STATUS_TEXT = {
  above: {
    get text() {
      return t('Above typical');
    },
    get color() {
      return labColors.outText;
    },
  },
  below: {
    get text() {
      return t('Below typical');
    },
    get color() {
      return labColors.outText;
    },
  },
  in: {
    get text() {
      return t('In typical range');
    },
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

/** Vaccination status colours from the current light/dark palette. */
export function vaccineColors(status: 'overdue' | 'due' | 'upcoming' | 'undated' | 'given') {
  if (status === 'overdue') return { color: colors.warnText, bg: colors.warnBg };
  if (status === 'due') return { color: colors.infoText, bg: colors.infoBg };
  if (status === 'given') return { color: colors.okText, bg: colors.okBg };
  return { color: colors.muted, bg: colors.subtle };
}
