import { t } from '../i18n';

/**
 * Common lab tests, grouped into the panels labs usually print together.
 * Ranges are typical adult values used only to pre-fill the form; the user is
 * asked to copy the range printed on their own report, which always wins.
 */
export type LabTestDef = {
  key: string;
  name: string;
  panel: PanelKey;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  aliases: string[];
};

export type PanelKey = 'diabetes' | 'lipid' | 'thyroid' | 'kidney' | 'liver' | 'blood' | 'vitamins' | 'other';

export const PANELS: { key: PanelKey; label: string }[] = [
  {
    key: 'diabetes',
    get label() {
      return t('Diabetes');
    },
  },
  {
    key: 'lipid',
    get label() {
      return t('Lipid profile');
    },
  },
  {
    key: 'thyroid',
    get label() {
      return t('Thyroid');
    },
  },
  {
    key: 'kidney',
    get label() {
      return t('Kidney');
    },
  },
  {
    key: 'liver',
    get label() {
      return t('Liver');
    },
  },
  {
    key: 'blood',
    get label() {
      return t('Blood count');
    },
  },
  {
    key: 'vitamins',
    get label() {
      return t('Vitamins & minerals');
    },
  },
  {
    key: 'other',
    get label() {
      return t('Other tests');
    },
  },
];

export const LAB_TESTS: LabTestDef[] = [
  { key: 'hba1c', name: 'HbA1c', panel: 'diabetes', unit: '%', refLow: null, refHigh: 5.7, aliases: ['a1c', 'hb a1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin', 'glycosylated haemoglobin', 'glycosylated haemoglobin hba1c', 'hba1c glycosylated hemoglobin', 'hemoglobin a1c', 'haemoglobin a1c'] },
  { key: 'glucose_fasting', name: 'Fasting glucose', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 100, aliases: ['fbs', 'fasting blood sugar', 'fasting blood glucose', 'fasting plasma glucose', 'fpg', 'glucose fasting', 'glucose fasting f', 'fasting glucose', 'blood sugar fasting', 'plasma glucose fasting', 'glucose f', 'fasting sugar'] },
  { key: 'glucose_pp', name: 'Post-meal glucose (PP)', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 140, aliases: ['ppbs', 'pp blood sugar', 'post prandial blood sugar', 'postprandial glucose', 'glucose pp', 'glucose post prandial', 'glucose postprandial', 'glucose pp 2 hrs', 'post prandial glucose', 'plasma glucose pp', 'blood sugar pp', 'glucose post prandial pp', 'glucose 2 hours post meal', 'post prandial plasma glucose'] },
  { key: 'glucose_random', name: 'Random glucose', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 140, aliases: ['rbs', 'random blood sugar', 'random blood glucose', 'glucose random', 'random glucose', 'plasma glucose random', 'random plasma glucose'] },

  { key: 'chol_total', name: 'Total cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 200, aliases: ['cholesterol', 'serum cholesterol', 'cholesterol total', 'total cholestrol', 'total cholesterol', 'serum total cholesterol'] },
  { key: 'ldl', name: 'LDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 100, aliases: ['ldl', 'ldl c', 'ldl direct', 'ldl cholestrol', 'ldl cholesterol', 'cholesterol ldl', 'low density lipoprotein', 'ldl c direct', 'ldl cholesterol direct'] },
  { key: 'hdl', name: 'HDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: 40, refHigh: null, aliases: ['hdl', 'hdl c', 'hdl cholestrol', 'hdl cholesterol', 'cholesterol hdl', 'high density lipoprotein', 'hdl cholesterol direct', 'hdl c direct'] },
  { key: 'triglycerides', name: 'Triglycerides', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 150, aliases: ['tg', 'triglyceride', 'serum triglycerides', 'triglycerides serum', 'serum triglyceride'] },
  { key: 'vldl', name: 'VLDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 30, aliases: ['vldl', 'vldl cholesterol', 'cholesterol vldl', 'very low density lipoprotein'] },

  { key: 'tsh', name: 'TSH', panel: 'thyroid', unit: 'µIU/mL', refLow: 0.4, refHigh: 4.0, aliases: ['thyroid stimulating hormone', 'tsh ultrasensitive', 's tsh', 'tsh 3rd generation', 'tsh ultra sensitive', 'ultrasensitive tsh', 'thyrotropin', 'tsh thyroid stimulating hormone'] },
  { key: 't3_total', name: 'Total T3', panel: 'thyroid', unit: 'ng/dL', refLow: 80, refHigh: 200, aliases: ['t3', 'triiodothyronine', 'total t3', 't3 total', 'total triiodothyronine', 'triiodothyronine total'] },
  { key: 't4_total', name: 'Total T4', panel: 'thyroid', unit: 'µg/dL', refLow: 5.1, refHigh: 14.1, aliases: ['t4', 'thyroxine', 'total t4', 't4 total', 'total thyroxine', 'thyroxine total'] },
  { key: 't4_free', name: 'Free T4', panel: 'thyroid', unit: 'ng/dL', refLow: 0.9, refHigh: 1.7, aliases: ['ft4', 'free thyroxine', 'free t4', 't4 free', 'ft4 free thyroxine', 'free thyroxine ft4'] },

  { key: 'creatinine', name: 'Creatinine', panel: 'kidney', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, aliases: ['serum creatinine', 's creatinine', 'creatinine serum', 'creatinine'] },
  { key: 'urea', name: 'Blood urea', panel: 'kidney', unit: 'mg/dL', refLow: 15, refHigh: 45, aliases: ['urea', 'serum urea', 'blood urea', 'urea serum'] },
  { key: 'bun', name: 'BUN', panel: 'kidney', unit: 'mg/dL', refLow: 7, refHigh: 20, aliases: ['blood urea nitrogen', 'bun', 'blood urea nitrogen bun', 'urea nitrogen'] },
  { key: 'uric_acid', name: 'Uric acid', panel: 'kidney', unit: 'mg/dL', refLow: 3.5, refHigh: 7.2, aliases: ['serum uric acid', 'uric acid', 'uric acid serum'] },
  { key: 'egfr', name: 'eGFR', panel: 'kidney', unit: 'mL/min/1.73m²', refLow: 90, refHigh: null, aliases: ['gfr', 'estimated gfr', 'egfr', 'estimated glomerular filtration rate', 'egfr ckd epi', 'gfr estimated'] },

  { key: 'ast', name: 'SGOT (AST)', panel: 'liver', unit: 'U/L', refLow: null, refHigh: 40, aliases: ['ast', 'sgot', 'aspartate aminotransferase', 'sgot ast', 'ast sgot', 'aspartate transaminase', 'aspartate aminotransferase ast'] },
  { key: 'alt', name: 'SGPT (ALT)', panel: 'liver', unit: 'U/L', refLow: null, refHigh: 41, aliases: ['alt', 'sgpt', 'alanine aminotransferase', 'sgpt alt', 'alt sgpt', 'alanine transaminase', 'alanine aminotransferase alt'] },
  { key: 'alp', name: 'Alkaline phosphatase', panel: 'liver', unit: 'U/L', refLow: 44, refHigh: 147, aliases: ['alp', 'alk phos', 'alkaline phosphatase', 'alkaline phosphatase alp', 'alp alkaline phosphatase'] },
  { key: 'bilirubin_total', name: 'Total bilirubin', panel: 'liver', unit: 'mg/dL', refLow: 0.3, refHigh: 1.2, aliases: ['bilirubin', 'bilirubin total', 'serum bilirubin', 'total bilirubin'] },
  { key: 'albumin', name: 'Albumin', panel: 'liver', unit: 'g/dL', refLow: 3.5, refHigh: 5.0, aliases: ['serum albumin', 'albumin serum', 'albumin'] },

  { key: 'hemoglobin', name: 'Haemoglobin', panel: 'blood', unit: 'g/dL', refLow: 12, refHigh: 17, aliases: ['hemoglobin', 'hb', 'hgb', 'haemoglobin hb', 'haemoglobin', 'hemoglobin hb', 'hb haemoglobin'] },
  { key: 'wbc', name: 'WBC count', panel: 'blood', unit: '×10³/µL', refLow: 4, refHigh: 11, aliases: ['total wbc', 'tlc', 'total leucocyte count', 'white blood cells', 'total leukocyte count', 'total leucocyte count tlc', 'wbc count', 'total wbc count', 'white blood cell count'] },
  { key: 'platelets', name: 'Platelet count', panel: 'blood', unit: '×10³/µL', refLow: 150, refHigh: 450, aliases: ['platelets', 'plt', 'platelet count', 'platelets count', 'total platelet count'] },
  { key: 'rbc', name: 'RBC count', panel: 'blood', unit: 'million/µL', refLow: 4.2, refHigh: 5.9, aliases: ['rbc', 'red blood cells', 'rbc count', 'total rbc count', 'red blood cell count', 'rbc count red blood cell', 'erythrocyte count', 'red cell count'] },

  { key: 'vitamin_d', name: 'Vitamin D', panel: 'vitamins', unit: 'ng/mL', refLow: 30, refHigh: 100, aliases: ['vit d', '25 oh vitamin d', 'vitamin d3', '25 hydroxy vitamin d', 'vitamin d total', '25 oh vitamin d total', 'vitamin d 25 hydroxy', '25 hydroxy vitamin d total', 'vitamin d 25 oh', '25 hydroxyvitamin d', 'vitamin d total 25 hydroxy'] },
  { key: 'vitamin_b12', name: 'Vitamin B12', panel: 'vitamins', unit: 'pg/mL', refLow: 200, refHigh: 900, aliases: ['vit b12', 'b12', 'cobalamin', 'vitamin b12', 'vitamin b12 cyanocobalamin', 'cyanocobalamin'] },
  { key: 'ferritin', name: 'Ferritin', panel: 'vitamins', unit: 'ng/mL', refLow: 20, refHigh: 250, aliases: ['serum ferritin', 'ferritin', 'ferritin serum'] },
];

const BY_KEY = new Map(LAB_TESTS.map((t) => [t.key, t]));

export function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getTestDef(key: string) {
  return BY_KEY.get(key);
}

/** Finds the catalog test a typed name refers to, so "Glycosylated Hb" and "HbA1c" share one trend. */
export function matchTest(name: string): LabTestDef | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  return LAB_TESTS.find((t) => normalizeName(t.name) === n || t.aliases.some((a) => normalizeName(a) === n));
}

export function keyForName(name: string) {
  return matchTest(name)?.key ?? `custom:${normalizeName(name)}`;
}

export function panelOf(testKey: string): PanelKey {
  return BY_KEY.get(testKey)?.panel ?? 'other';
}

export function searchTests(query: string, limit = 8) {
  const n = normalizeName(query);
  if (!n) return [];
  return LAB_TESTS.filter((t) => normalizeName(t.name).includes(n) || t.aliases.some((a) => normalizeName(a).includes(n))).slice(0, limit);
}
