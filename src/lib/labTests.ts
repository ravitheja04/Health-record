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
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'lipid', label: 'Lipid profile' },
  { key: 'thyroid', label: 'Thyroid' },
  { key: 'kidney', label: 'Kidney' },
  { key: 'liver', label: 'Liver' },
  { key: 'blood', label: 'Blood count' },
  { key: 'vitamins', label: 'Vitamins & minerals' },
  { key: 'other', label: 'Other tests' },
];

export const LAB_TESTS: LabTestDef[] = [
  { key: 'hba1c', name: 'HbA1c', panel: 'diabetes', unit: '%', refLow: null, refHigh: 5.7, aliases: ['a1c', 'hb a1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin', 'glycosylated haemoglobin'] },
  { key: 'glucose_fasting', name: 'Fasting glucose', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 100, aliases: ['fbs', 'fasting blood sugar', 'fasting blood glucose', 'fasting plasma glucose', 'fpg', 'glucose fasting'] },
  { key: 'glucose_pp', name: 'Post-meal glucose (PP)', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 140, aliases: ['ppbs', 'pp blood sugar', 'post prandial blood sugar', 'postprandial glucose', 'glucose pp'] },
  { key: 'glucose_random', name: 'Random glucose', panel: 'diabetes', unit: 'mg/dL', refLow: 70, refHigh: 140, aliases: ['rbs', 'random blood sugar', 'random blood glucose'] },

  { key: 'chol_total', name: 'Total cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 200, aliases: ['cholesterol', 'serum cholesterol', 'cholesterol total', 'total cholestrol'] },
  { key: 'ldl', name: 'LDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 100, aliases: ['ldl', 'ldl c', 'ldl direct', 'ldl cholestrol'] },
  { key: 'hdl', name: 'HDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: 40, refHigh: null, aliases: ['hdl', 'hdl c', 'hdl cholestrol'] },
  { key: 'triglycerides', name: 'Triglycerides', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 150, aliases: ['tg', 'triglyceride', 'serum triglycerides'] },
  { key: 'vldl', name: 'VLDL cholesterol', panel: 'lipid', unit: 'mg/dL', refLow: null, refHigh: 30, aliases: ['vldl'] },

  { key: 'tsh', name: 'TSH', panel: 'thyroid', unit: 'µIU/mL', refLow: 0.4, refHigh: 4.0, aliases: ['thyroid stimulating hormone', 'tsh ultrasensitive', 's tsh'] },
  { key: 't3_total', name: 'Total T3', panel: 'thyroid', unit: 'ng/dL', refLow: 80, refHigh: 200, aliases: ['t3', 'triiodothyronine'] },
  { key: 't4_total', name: 'Total T4', panel: 'thyroid', unit: 'µg/dL', refLow: 5.1, refHigh: 14.1, aliases: ['t4', 'thyroxine'] },
  { key: 't4_free', name: 'Free T4', panel: 'thyroid', unit: 'ng/dL', refLow: 0.9, refHigh: 1.7, aliases: ['ft4', 'free thyroxine'] },

  { key: 'creatinine', name: 'Creatinine', panel: 'kidney', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, aliases: ['serum creatinine', 's creatinine'] },
  { key: 'urea', name: 'Blood urea', panel: 'kidney', unit: 'mg/dL', refLow: 15, refHigh: 45, aliases: ['urea', 'serum urea'] },
  { key: 'bun', name: 'BUN', panel: 'kidney', unit: 'mg/dL', refLow: 7, refHigh: 20, aliases: ['blood urea nitrogen'] },
  { key: 'uric_acid', name: 'Uric acid', panel: 'kidney', unit: 'mg/dL', refLow: 3.5, refHigh: 7.2, aliases: ['serum uric acid'] },
  { key: 'egfr', name: 'eGFR', panel: 'kidney', unit: 'mL/min/1.73m²', refLow: 90, refHigh: null, aliases: ['gfr', 'estimated gfr'] },

  { key: 'ast', name: 'SGOT (AST)', panel: 'liver', unit: 'U/L', refLow: null, refHigh: 40, aliases: ['ast', 'sgot', 'aspartate aminotransferase'] },
  { key: 'alt', name: 'SGPT (ALT)', panel: 'liver', unit: 'U/L', refLow: null, refHigh: 41, aliases: ['alt', 'sgpt', 'alanine aminotransferase'] },
  { key: 'alp', name: 'Alkaline phosphatase', panel: 'liver', unit: 'U/L', refLow: 44, refHigh: 147, aliases: ['alp', 'alk phos'] },
  { key: 'bilirubin_total', name: 'Total bilirubin', panel: 'liver', unit: 'mg/dL', refLow: 0.3, refHigh: 1.2, aliases: ['bilirubin', 'bilirubin total', 'serum bilirubin'] },
  { key: 'albumin', name: 'Albumin', panel: 'liver', unit: 'g/dL', refLow: 3.5, refHigh: 5.0, aliases: ['serum albumin'] },

  { key: 'hemoglobin', name: 'Haemoglobin', panel: 'blood', unit: 'g/dL', refLow: 12, refHigh: 17, aliases: ['hemoglobin', 'hb', 'hgb', 'haemoglobin hb'] },
  { key: 'wbc', name: 'WBC count', panel: 'blood', unit: '×10³/µL', refLow: 4, refHigh: 11, aliases: ['total wbc', 'tlc', 'total leucocyte count', 'white blood cells', 'total leukocyte count'] },
  { key: 'platelets', name: 'Platelet count', panel: 'blood', unit: '×10³/µL', refLow: 150, refHigh: 450, aliases: ['platelets', 'plt'] },
  { key: 'rbc', name: 'RBC count', panel: 'blood', unit: 'million/µL', refLow: 4.2, refHigh: 5.9, aliases: ['rbc', 'red blood cells'] },

  { key: 'vitamin_d', name: 'Vitamin D', panel: 'vitamins', unit: 'ng/mL', refLow: 30, refHigh: 100, aliases: ['vit d', '25 oh vitamin d', 'vitamin d3', '25 hydroxy vitamin d', 'vitamin d total'] },
  { key: 'vitamin_b12', name: 'Vitamin B12', panel: 'vitamins', unit: 'pg/mL', refLow: 200, refHigh: 900, aliases: ['vit b12', 'b12', 'cobalamin'] },
  { key: 'ferritin', name: 'Ferritin', panel: 'vitamins', unit: 'ng/mL', refLow: 20, refHigh: 250, aliases: ['serum ferritin'] },
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
