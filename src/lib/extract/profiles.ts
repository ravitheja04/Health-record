/**
 * What each lab's PDF report looks like. Apollo Diagnostics / Apollo 24|7 and
 * Tata 1mg Labs print a table with Test Name | Result | Unit | reference range
 * | Method, a block of patient details above it, and specimen or method notes
 * mixed into the test names. A profile lists the words each lab uses, so the
 * generic parser can find the table and clean names. Unknown labs use the
 * generic profile, which covers most Indian lab reports (same NABL layout).
 */

export type ColumnKind = 'name' | 'result' | 'unit' | 'range' | 'method' | 'flag';

export type LabProfile = {
  id: 'apollo' | 'tata1mg' | 'generic';
  /** Shown to the user and saved as the record's hospital / lab. */
  labName: string;
  detect: RegExp;
  /** Header words for each column; the first matching kind wins. */
  headers: [ColumnKind, RegExp][];
  /** Lines that are never results: notes, signatures, page furniture. */
  skip: RegExp[];
  /** Text removed from test names before matching, e.g. specimen and method. */
  nameNoise: RegExp[];
  meta: {
    patient: RegExp;
    age: RegExp;
    gender: RegExp;
    collected: RegExp;
    reported: RegExp;
    doctor: RegExp;
  };
};

const COMMON_HEADERS: [ColumnKind, RegExp][] = [
  ['name', /^(?:test\s*(?:name|description|parameters?)?|investigations?|parameters?|tests?\s+done|description|examination)$/i],
  ['result', /^(?:results?|values?|observed\s*values?|observations?|your\s*(?:result|value))$/i],
  ['unit', /^(?:units?|uom)$/i],
  ['range', /^(?:bio\.?\s*ref(?:erence)?\.?\s*(?:range|interval|intervals?)?|biological\s*ref(?:erence)?\.?\s*(?:range|interval)s?|ref(?:erence)?\.?\s*(?:range|interval|value)s?|normal\s*(?:range|values?)|expected\s*values?)$/i],
  ['method', /^(?:methods?|methodology|technique)$/i],
  ['flag', /^(?:flag|status|remarks?)$/i],
];

const COMMON_SKIP = [
  /^(?:method|methodology|specimen|sample\s*type|sample)\s*[:-]/i,
  /^(?:note|notes|comments?|interpretation|remarks?|clinical\s+significance|disclaimer|advice|suggestions?)\b/i,
  /\b(?:page\s+\d+\s+of\s+\d+|end\s+of\s+report|electronically\s+(?:signed|authenticated)|consultant\s+(?:pathologist|biochemist|microbiologist)|dr\.\s*\w+.*\b(?:md|dnb|mbbs)\b)/i,
  /^(?:this\s+(?:report|test)|tests?\s+marked|results?\s+relate|the\s+results?)\b/i,
  /\b(?:nabl|cap\s+accredited|iso\s+15189)\b/i,
];

const COMMON_NOISE = [
  /\((?:serum|plasma|whole\s*blood|edta|naf\s*plasma|fluoride\s*plasma|urine|calculated|calc\.?|derived|clia|cmia|eclia|ecl|hplc|photometry|spectrophotometry|enzymatic|immunoturbidimetry|turbidimetry|elisa|ise|direct|indirect|automated|electrical\s*impedance|flow\s*cytometry|microscopy|ifcc|jaffe|kinetic|colorimetric)\)/gi,
  /,?\s*\b(?:serum|plasma|naf\s*plasma|fluoride\s*plasma|whole\s*blood\s*edta|edta\s*whole\s*blood|whole\s*blood|edta\s*blood|edta)\s*$/i,
  /\s*[-–]\s*(?:calculated|direct|serum|plasma)\s*$/i,
  /\*+/g,
];

const COMMON_META = {
  patient: /^(?:patient\s*name|patient|name\s*of\s*(?:the\s*)?patient|name)$/i,
  age: /^(?:age\s*\/\s*(?:gender|sex)|age\s*\/\s*g|age|age\s*&\s*(?:gender|sex))$/i,
  gender: /^(?:gender|sex)$/i,
  collected: /^(?:collected(?:\s*(?:on|at|date))?|sample\s*collected(?:\s*(?:on|at|date))?|collection\s*(?:date|time|date\s*&\s*time|on)|sample\s*collection\s*(?:date|on)|registered(?:\s*on)?|registration\s*(?:date|on)|sample\s*date)$/i,
  reported: /^(?:reported(?:\s*(?:on|at|date))?|report\s*(?:date|released\s*on|generated\s*on|status\s*date)|released\s*on|report\s*on|approved\s*on)$/i,
  doctor: /^(?:ref(?:erring|erred)?\.?\s*(?:doctor|dr\.?|by|physician)|consultant|ref\.?\s*by|referred\s*by)$/i,
};

export const PROFILES: LabProfile[] = [
  {
    id: 'apollo',
    labName: 'Apollo Diagnostics',
    detect: /\bapollo\s*(?:diagnostics|health\s*(?:and|&)\s*lifestyle|24\s*\|?\s*7|clinic|hospitals?|labs?)\b|\bapollo247\b|\bapollodiagnostics\b/i,
    headers: COMMON_HEADERS,
    skip: [...COMMON_SKIP, /^(?:uhid|mr\s*no|visit\s*id|lab\s*no|bill\s*no|barcode|sin\s*no)\b/i, /\bapollo\b.*\b(?:ltd|limited|pvt)\b/i],
    nameNoise: COMMON_NOISE,
    meta: COMMON_META,
  },
  {
    id: 'tata1mg',
    labName: 'Tata 1mg Labs',
    detect: /\b(?:tata\s*)?1\s*mg\b|\b1mg\s*(?:labs|technologies)\b/i,
    headers: COMMON_HEADERS,
    skip: [...COMMON_SKIP, /^(?:booking\s*id|order\s*id|lab\s*id|barcode|sample\s*id|patient\s*id)\b/i, /\b(?:tata\s*1mg|1mg\s*technologies)\b.*\b(?:ltd|limited|pvt)\b/i],
    nameNoise: COMMON_NOISE,
    meta: COMMON_META,
  },
  {
    id: 'generic',
    labName: '',
    detect: /.^/, // Never auto-detected; used when nothing else matches.
    headers: COMMON_HEADERS,
    skip: COMMON_SKIP,
    nameNoise: COMMON_NOISE,
    meta: COMMON_META,
  },
];

export function detectProfile(text: string): LabProfile {
  return PROFILES.find((p) => p.detect.test(text)) ?? PROFILES[PROFILES.length - 1];
}
