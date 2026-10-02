/**
 * Childhood vaccination schedules used in India, as typical ages from birth.
 * They are starting points only: the app tells families to confirm every date
 * with their paediatrician, and each dose can be edited or removed.
 */
export type ScheduleAge = { weeks?: number; months?: number; years?: number };

export type ScheduleDose = {
  /** Stable id within the schedule, e.g. "mmr-1". */
  id: string;
  name: string;
  dose: string;
  age: ScheduleAge;
  /** Shown next to the age, e.g. "9–12 months". */
  ageLabel: string;
};

export type VaccineSchedule = {
  key: 'nis' | 'iap';
  title: string;
  description: string;
  doses: ScheduleDose[];
};

const d = (id: string, name: string, dose: string, age: ScheduleAge, ageLabel: string): ScheduleDose => ({
  id,
  name,
  dose,
  age,
  ageLabel,
});

export const SCHEDULES: VaccineSchedule[] = [
  {
    key: 'nis',
    title: 'Government schedule (NIS)',
    description: 'India’s National Immunization Schedule, given free at government centres.',
    doses: [
      d('bcg', 'BCG', 'At birth', {}, 'Birth'),
      d('opv-0', 'OPV', 'Dose 0', {}, 'Birth'),
      d('hepb-0', 'Hepatitis B', 'Birth dose', {}, 'Birth'),
      d('opv-1', 'OPV', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('penta-1', 'Pentavalent', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('rvv-1', 'Rotavirus', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('fipv-1', 'fIPV', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('pcv-1', 'PCV', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('opv-2', 'OPV', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('penta-2', 'Pentavalent', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('rvv-2', 'Rotavirus', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('opv-3', 'OPV', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('penta-3', 'Pentavalent', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('rvv-3', 'Rotavirus', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('fipv-2', 'fIPV', 'Dose 2', { weeks: 14 }, '14 weeks'),
      d('pcv-2', 'PCV', 'Dose 2', { weeks: 14 }, '14 weeks'),
      d('mr-1', 'Measles-Rubella (MR)', 'Dose 1', { months: 9 }, '9–12 months'),
      d('pcv-b', 'PCV', 'Booster', { months: 9 }, '9 months'),
      d('fipv-3', 'fIPV', 'Dose 3', { months: 9 }, '9 months'),
      d('mr-2', 'Measles-Rubella (MR)', 'Dose 2', { months: 16 }, '16–24 months'),
      d('dpt-b1', 'DPT', 'Booster 1', { months: 16 }, '16–24 months'),
      d('opv-b', 'OPV', 'Booster', { months: 16 }, '16–24 months'),
      d('dpt-b2', 'DPT', 'Booster 2', { years: 5 }, '5–6 years'),
      d('td-10', 'Td', 'At 10 years', { years: 10 }, '10 years'),
      d('td-16', 'Td', 'At 16 years', { years: 16 }, '16 years'),
    ],
  },
  {
    key: 'iap',
    title: 'IAP schedule',
    description: 'Indian Academy of Pediatrics schedule, commonly followed by private paediatricians.',
    doses: [
      d('bcg', 'BCG', 'At birth', {}, 'Birth'),
      d('opv-0', 'OPV', 'Dose 0', {}, 'Birth'),
      d('hepb-1', 'Hepatitis B', 'Dose 1', {}, 'Birth'),
      d('dtp-1', 'DTwP / DTaP', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('ipv-1', 'IPV', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('hib-1', 'Hib', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('hepb-2', 'Hepatitis B', 'Dose 2', { weeks: 6 }, '6 weeks'),
      d('rv-1', 'Rotavirus', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('pcv-1', 'PCV', 'Dose 1', { weeks: 6 }, '6 weeks'),
      d('dtp-2', 'DTwP / DTaP', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('ipv-2', 'IPV', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('hib-2', 'Hib', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('hepb-3', 'Hepatitis B', 'Dose 3', { weeks: 10 }, '10 weeks'),
      d('rv-2', 'Rotavirus', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('pcv-2', 'PCV', 'Dose 2', { weeks: 10 }, '10 weeks'),
      d('dtp-3', 'DTwP / DTaP', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('ipv-3', 'IPV', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('hib-3', 'Hib', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('hepb-4', 'Hepatitis B', 'Dose 4', { weeks: 14 }, '14 weeks'),
      d('rv-3', 'Rotavirus', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('pcv-3', 'PCV', 'Dose 3', { weeks: 14 }, '14 weeks'),
      d('flu-1', 'Influenza', 'Dose 1', { months: 6 }, '6 months'),
      d('flu-2', 'Influenza', 'Dose 2', { months: 7 }, '7 months'),
      d('tcv', 'Typhoid conjugate (TCV)', 'Dose 1', { months: 6 }, '6–9 months'),
      d('mmr-1', 'MMR', 'Dose 1', { months: 9 }, '9 months'),
      d('hepa-1', 'Hepatitis A', 'Dose 1', { months: 12 }, '12 months'),
      d('pcv-b', 'PCV', 'Booster', { months: 12 }, '12–15 months'),
      d('mmr-2', 'MMR', 'Dose 2', { months: 15 }, '15 months'),
      d('var-1', 'Varicella (chickenpox)', 'Dose 1', { months: 15 }, '15 months'),
      d('dtp-b1', 'DTwP / DTaP', 'Booster 1', { months: 16 }, '16–18 months'),
      d('hib-b1', 'Hib', 'Booster 1', { months: 16 }, '16–18 months'),
      d('ipv-b1', 'IPV', 'Booster 1', { months: 16 }, '16–18 months'),
      d('hepa-2', 'Hepatitis A', 'Dose 2', { months: 18 }, '18–19 months'),
      d('var-2', 'Varicella (chickenpox)', 'Dose 2', { months: 18 }, '18–19 months'),
      d('dtp-b2', 'DTwP / DTaP', 'Booster 2', { years: 4 }, '4–6 years'),
      d('mmr-3', 'MMR', 'Dose 3', { years: 4 }, '4–6 years'),
      d('hpv-1', 'HPV', 'Dose 1', { years: 9 }, '9–14 years'),
      d('hpv-2', 'HPV', 'Dose 2', { years: 9, months: 6 }, '6 months after dose 1'),
      d('tdap', 'Tdap / Td', 'Booster', { years: 10 }, '10–12 years'),
    ],
  },
];

/** Common vaccines for quick entry, including adult ones. */
export const COMMON_VACCINES = [
  'Influenza (flu)',
  'COVID-19',
  'Tdap / Td',
  'Hepatitis B',
  'Hepatitis A',
  'HPV',
  'Pneumococcal',
  'Shingles (zoster)',
  'Typhoid',
  'MMR',
  'Varicella (chickenpox)',
  'Rabies',
];

export function getSchedule(key: string) {
  return SCHEDULES.find((s) => s.key === key);
}
