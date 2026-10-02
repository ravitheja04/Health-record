/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchMember, parseReport, type ExtractedReport } from '../extract/parseReport';
import { parseRange, parseReportDate, parseValue, tidyUnit } from '../extract/values';
import { buildPdf, readItems, type FixtureLine } from './fixtures/reportPdf';

async function extract(pages: FixtureLine[][]) {
  return parseReport(await readItems(await buildPdf(pages)));
}

const row = (report: ExtractedReport, key: string) => {
  const r = report.rows.find((x) => x.testKey === key);
  assert.ok(r, `expected a row for ${key}; got ${report.rows.map((x) => x.testKey).join(', ')}`);
  return r;
};

// ---- Apollo Diagnostics layout ------------------------------------------------
// Two-column patient block, department + test headings, a table with
// Test Name | Result | Unit | Bio. Ref. Range | Method, method names in the
// last column, interpretation tables, and the patient block repeated on page 2.

const apolloHeader: FixtureLine[] = [
  [[40, 'Apollo DIAGNOSTICS', 14, true], [400, 'Expertise. Empowering you.', 7]],
  8,
  [[40, 'Patient Name', 8], [120, ': Mr.RAVI KUMAR', 8], [330, 'Collected', 8], [400, ': 12/Sep/2026 08:15AM', 8]],
  [[40, 'Age/Gender', 8], [120, ': 45 Y 2 M 10 D/M', 8], [330, 'Received', 8], [400, ': 12/Sep/2026 09:40AM', 8]],
  [[40, 'UHID/MR No', 8], [120, ': CHE.0000123456', 8], [330, 'Reported', 8], [400, ': 13/Sep/2026 02:31PM', 8]],
  [[40, 'Visit ID', 8], [120, ': CHEOPV123456', 8], [330, 'Status', 8], [400, ': Final Report', 8]],
  [[40, 'Ref Doctor', 8], [120, ': Dr.SELF', 8], [330, 'Sponsor Name', 8], [400, ': ARCOFEMI HEALTHCARE LIMITED', 8]],
  10,
];
const apolloTableHeader: FixtureLine = [
  [40, 'Test Name', 9, true],
  [250, 'Result', 9, true],
  [310, 'Unit', 9, true],
  [380, 'Bio. Ref. Range', 9, true],
  [490, 'Method', 9, true],
];

const apolloPages: FixtureLine[][] = [
  [
    ...apolloHeader,
    [[220, 'DEPARTMENT OF BIOCHEMISTRY', 10, true]],
    [[40, 'GLUCOSE, FASTING , NAF PLASMA', 9, true]],
    apolloTableHeader,
    [[40, 'FASTING GLUCOSE , NAF PLASMA'], [250, '112'], [310, 'mg/dL'], [380, '70-100'], [490, 'HEXOKINASE']],
    6,
    [[40, 'HBA1C (GLYCATED HEMOGLOBIN) , WHOLE BLOOD EDTA', 9, true]],
    apolloTableHeader,
    [[40, 'HBA1C, GLYCATED HEMOGLOBIN'], [250, '6.4'], [310, '%'], [490, 'HPLC']],
    [[40, 'ESTIMATED AVERAGE GLUCOSE (eAG)'], [250, '137'], [310, 'mg/dL'], [490, 'Calculated']],
    [[40, 'Comment:', 8]],
    [[40, 'REFERENCE GROUP', 8, true], [250, 'HBA1C %', 8, true]],
    [[40, 'NON DIABETIC', 8], [250, '<5.7', 8]],
    [[40, 'PREDIABETES', 8], [250, '5.7 - 6.4', 8]],
    [[40, 'DIABETES', 8], [250, '>= 6.5', 8]],
    6,
    [[40, 'LIPID PROFILE , SERUM', 9, true]],
    apolloTableHeader,
    [[40, 'TOTAL CHOLESTEROL'], [250, '212'], [310, 'mg/dL'], [380, 'Desirable: <200'], [490, 'CHO-POD']],
    [[380, 'Borderline High: 200-239']],
    [[380, 'High: >=240']],
    [[40, 'TRIGLYCERIDES'], [250, '180'], [310, 'mg/dL'], [380, '<150'], [490, 'GPO-POD']],
    [[40, 'HDL CHOLESTEROL'], [250, '38'], [310, 'mg/dL'], [380, '>40'], [490, 'Direct']],
    [[40, 'NON-HDL CHOLESTEROL'], [250, '174'], [310, 'mg/dL'], [380, '<130'], [490, 'Calculated']],
    [[40, 'LDL CHOLESTEROL'], [250, '138'], [310, 'mg/dL'], [380, '<100'], [490, 'Calculated']],
    [[40, 'VLDL CHOLESTEROL'], [250, '36'], [310, 'mg/dL'], [380, '<30'], [490, 'Calculated']],
    [[40, 'CHOL / HDL RATIO'], [250, '5.58'], [380, '0-4.97'], [490, 'Calculated']],
    10,
    [[40, 'Page 1 of 2', 7], [400, '*** End Of Page ***', 7]],
  ],
  [
    ...apolloHeader,
    [[220, 'DEPARTMENT OF HAEMATOLOGY', 10, true]],
    [[40, 'COMPLETE BLOOD COUNT (CBC) , WHOLE BLOOD EDTA', 9, true]],
    apolloTableHeader,
    [[40, 'HAEMOGLOBIN'], [250, '13.2'], [310, 'g/dL'], [380, '13-17'], [490, 'Spectrophotometer']],
    [[40, 'PCV'], [250, '40.1'], [310, '%'], [380, '40-50'], [490, 'Electronic pulse']],
    [[40, 'RBC COUNT'], [250, '4.6'], [310, 'Million/cu.mm'], [380, '4.5-5.5'], [490, 'Electrical Impedence']],
    [[40, 'TOTAL LEUCOCYTE COUNT (TLC)'], [250, '7,850'], [310, 'cells/cu.mm'], [380, '4000-10000'], [490, 'Electrical Impedance']],
    [[40, 'DIFFERENTIAL LEUCOCYTE COUNT (DLC)', 9, true]],
    [[40, 'NEUTROPHILS'], [250, '62'], [310, '%'], [380, '40-80'], [490, 'Microscopy']],
    [[40, 'PLATELET COUNT'], [250, '1,85,000'], [310, 'cells/cu.mm'], [380, '150000-410000'], [490, 'Electrical Impedance']],
    6,
    [[220, 'DEPARTMENT OF IMMUNOLOGY', 10, true]],
    [[40, 'THYROID PROFILE TOTAL (T3, T4, TSH), SERUM', 9, true]],
    apolloTableHeader,
    [[40, 'TRI-IODOTHYRONINE (T3, TOTAL)'], [250, '1.1'], [310, 'ng/mL'], [380, '0.7-2.04'], [490, 'CLIA']],
    [[40, 'THYROXINE (T4, TOTAL)'], [250, '8.4'], [310, 'µg/dL'], [380, '5.1-14.1'], [490, 'CLIA']],
    [[40, 'THYROID STIMULATING HORMONE'], [250, '5.9'], [310, 'µIU/mL'], [380, '0.34-5.60'], [490, 'CLIA']],
    [[40, '(TSH)']],
    [[40, 'VITAMIN D (25 - OH VITAMIN D) , SERUM'], [250, '18.5'], [310, 'ng/mL'], [380, 'Deficiency: <20'], [490, 'CLIA']],
    [[380, 'Insufficiency: 20 - <30']],
    [[380, 'Sufficiency: 30 - 100']],
    [[380, 'Toxicity: >100']],
    [[40, 'COLOUR'], [250, 'PALE YELLOW'], [490, 'Visual']],
    10,
    [[40, '*** End Of Report ***', 7]],
    [[40, 'DR. ANITA RAO', 8, true]],
    [[40, 'MD (Pathology) Consultant Pathologist', 7]],
    [[40, 'Apollo Health and Lifestyle Limited (CIN - U85110TG2000PLC115819)', 7]],
    [[40, 'Page 2 of 2', 7]],
  ],
];

test('Apollo report: patient details', async () => {
  const r = await extract(apolloPages);
  assert.equal(r.labId, 'apollo');
  assert.equal(r.labName, 'Apollo Diagnostics');
  assert.equal(r.patientName, 'Ravi Kumar');
  assert.equal(r.age, '45');
  assert.equal(r.gender, 'male');
  assert.equal(r.collectedDate, '2026-09-12');
  assert.equal(r.reportedDate, '2026-09-13');
  assert.equal(r.doctor, null); // "SELF" isn't a doctor
  assert.equal(r.hasText, true);
});

test('Apollo report: values, units and ranges', async () => {
  const r = await extract(apolloPages);
  assert.deepEqual(
    (({ value, unit, refLow, refHigh }) => ({ value, unit, refLow, refHigh }))(row(r, 'glucose_fasting')),
    { value: 112, unit: 'mg/dL', refLow: 70, refHigh: 100 }
  );
  assert.equal(row(r, 'hba1c').value, 6.4);
  assert.equal(row(r, 'chol_total').value, 212);
  assert.equal(row(r, 'chol_total').refHigh, 200); // "Desirable" band, not "High"
  assert.equal(row(r, 'chol_total').refLow, null);
  assert.equal(row(r, 'hdl').refLow, 40);
  assert.equal(row(r, 'ldl').refHigh, 100);
  assert.equal(row(r, 'vldl').value, 36);
  assert.equal(row(r, 'triglycerides').refHigh, 150);
  assert.equal(row(r, 'hemoglobin').value, 13.2);
  assert.equal(row(r, 'wbc').value, 7850);
  assert.equal(row(r, 'platelets').value, 185000); // Indian digit grouping
  assert.equal(row(r, 'rbc').unit, 'Million/cu.mm');
  assert.equal(row(r, 't3_total').value, 1.1);
  assert.equal(row(r, 't4_total').unit, 'µg/dL');
  assert.equal(row(r, 'tsh').value, 5.9);
  assert.equal(row(r, 'tsh').refHigh, 5.6);
  assert.deepEqual([row(r, 'vitamin_d').refLow, row(r, 'vitamin_d').refHigh], [30, 100]);
});

test('Apollo report: interpretation tables, notes and footers are not read as results', async () => {
  const r = await extract(apolloPages);
  const names = r.rows.map((x) => x.printedName.toLowerCase());
  for (const bad of ['non diabetic', 'prediabetes', 'diabetes', 'page', 'reference group', 'age/gender']) {
    assert.ok(!names.some((n) => n.startsWith(bad)), `"${bad}" should not be a result (${names.join(' | ')})`);
  }
  // Tests outside the app's catalog are kept with their printed names.
  assert.ok(r.rows.some((x) => x.testName === 'Neutrophils' && !x.matched && x.value === 62));
  assert.ok(r.rows.some((x) => x.testName === 'Chol / HDL Ratio' && x.value === 5.58));
  assert.deepEqual(r.skipped, [{ name: 'Colour', value: 'PALE YELLOW' }]);
  assert.equal(r.rows.filter((x) => x.testKey === 'hba1c').length, 1);
  assert.ok(r.rows.some((x) => x.testName === 'Estimated Average Glucose (EAG)'));
});

test('Apollo report: headings above each table become sections', async () => {
  const r = await extract(apolloPages);
  assert.equal(row(r, 'chol_total').section, 'Lipid Profile');
  assert.equal(row(r, 'hemoglobin').section, 'Complete Blood Count (CBC)');
  assert.equal(r.rows.find((x) => x.testName === 'Neutrophils')?.section, 'Differential Leucocyte Count (DLC)');
  assert.equal(row(r, 'tsh').section, 'Thyroid Profile Total (T3, T4, TSH)');
});

// ---- Tata 1mg Labs layout -----------------------------------------------------
// Single-column patient block, Test Name | Value | Unit | Bio. Ref. Interval,
// small "Method:" line under each test, "High"/"Low" next to the value,
// labels after numbers in lipid bands and gender-specific ranges.

const tataPages: FixtureLine[][] = [
  [
    [[40, 'TATA 1mg', 14, true], [360, 'Tata 1mg Labs, Gurugram', 7]],
    8,
    [[40, 'Name', 8], [130, ': Mrs. PRIYA SHARMA', 8], [330, 'Booking ID', 8], [420, ': 1MGB12345678', 8]],
    [[40, 'Age / Gender', 8], [130, ': 52 Years / Female', 8], [330, 'Sample Collected on', 8], [420, ': 02 Oct 2026, 07:45 AM', 8]],
    [[40, 'Referred by', 8], [130, ': Dr. Meera Iyer', 8], [330, 'Report Released on', 8], [420, ': 02 Oct 2026, 06:10 PM', 8]],
    10,
    [[40, 'Test Name', 9, true], [240, 'Value', 9, true], [320, 'Unit', 9, true], [400, 'Bio. Ref Interval', 9, true]],
    [[40, 'Diabetes Monitoring', 10, true]],
    [[40, 'HbA1c'], [240, '6.9', 9, true], [262, 'High', 8, true], [320, '%'], [400, '<5.7 Non-diabetic']],
    [[40, 'Method: HPLC', 7], [400, '5.7-6.4 Pre-diabetic']],
    [[400, '>=6.5 Diabetic']],
    [[40, 'Fasting Blood Sugar'], [240, '128', 9, true], [262, 'High', 8, true], [320, 'mg/dl'], [400, '74 - 106']],
    [[40, 'Method: Hexokinase', 7]],
    [[40, 'Lipid Profile', 10, true]],
    [[40, 'Cholesterol - Total'], [240, '245', 9, true], [262, 'High', 8, true], [320, 'mg/dl'], [400, '<200 Desirable']],
    [[400, '200-239 Borderline High']],
    [[400, '>=240 High']],
    [[40, 'Cholesterol - HDL'], [240, '52'], [320, 'mg/dl'], [400, '>50']],
    [[40, 'Cholesterol - LDL'], [240, '160', 9, true], [262, 'High', 8, true], [320, 'mg/dl'], [400, '<100 Optimal']],
    [[400, '100-129 Near Optimal']],
    [[40, 'Complete Blood Count', 10, true]],
    [[40, 'Hemoglobin'], [240, '11.4', 9, true], [262, 'Low', 8, true], [320, 'g/dl'], [400, 'Male: 13 - 17 Female: 12 - 15']],
    [[40, 'Platelet Count'], [240, '2.1'], [320, 'Lakhs/cumm'], [400, '1.5 - 4.1']],
    [[40, 'Vitamins', 10, true]],
    [[40, 'Vitamin B12'], [240, '180', 9, true], [262, 'Low', 8, true], [320, 'pg/mL'], [400, '211 - 911']],
    [[40, 'Thyroid Stimulating Hormone'], [240, '<0.01', 9, true], [262, 'Low', 8, true], [320, 'uIU/mL'], [400, '0.55 - 4.78']],
    [[40, '(TSH) - Ultrasensitive', 9]],
    [[40, 'Creatinine'], [240, '0.8'], [320, 'mg/dl'], [400, '0.55 - 1.02']],
    [[40, 'eGFR'], [240, '84'], [320, 'mL/min/1.73m2'], [400, '>=90']],
    10,
    [[40, 'Note: Results relate only to the sample tested. Interpretation is attached.', 7]],
    [[40, '~~~ End of report ~~~', 7]],
  ],
];

test('Tata 1mg report: details, flags and ranges', async () => {
  const r = await extract(tataPages);
  assert.equal(r.labId, 'tata1mg');
  assert.equal(r.labName, 'Tata 1mg Labs');
  assert.equal(r.patientName, 'Priya Sharma');
  assert.equal(r.age, '52');
  assert.equal(r.gender, 'female');
  assert.equal(r.collectedDate, '2026-10-02');
  assert.equal(r.doctor, 'Dr. Meera Iyer');

  const hba1c = row(r, 'hba1c');
  assert.deepEqual([hba1c.value, hba1c.flag, hba1c.refLow, hba1c.refHigh], [6.9, 'high', null, 5.7]);
  assert.equal(row(r, 'glucose_fasting').unit, 'mg/dL');
  assert.deepEqual([row(r, 'chol_total').refLow, row(r, 'chol_total').refHigh], [null, 200]);
  assert.equal(row(r, 'hdl').refLow, 50);
  assert.equal(row(r, 'ldl').refHigh, 100);
  // Female range picked because the report says Female.
  assert.deepEqual([row(r, 'hemoglobin').value, row(r, 'hemoglobin').flag, row(r, 'hemoglobin').refLow, row(r, 'hemoglobin').refHigh], [11.4, 'low', 12, 15]);
  assert.equal(row(r, 'platelets').unit, 'Lakhs/cumm');
  assert.equal(row(r, 'vitamin_b12').flag, 'low');
  const tsh = row(r, 'tsh');
  assert.deepEqual([tsh.value, tsh.approx, tsh.valueText, tsh.unit], [0.01, true, '<0.01', 'µIU/mL']);
  assert.equal(row(r, 'creatinine').value, 0.8);
  assert.deepEqual([row(r, 'egfr').unit, row(r, 'egfr').refLow], ['mL/min/1.73m²', 90]);
  assert.equal(r.rows.length, 11);
});

test('Tata 1mg report: section headings become sections, not tests', async () => {
  const r = await extract(tataPages);
  assert.equal(row(r, 'chol_total').section, 'Lipid Profile');
  assert.ok(!r.rows.some((x) => /monitoring|^vitamins$/i.test(x.testName)));
});

// ---- Other labs ---------------------------------------------------------------

test('unknown lab with a standard table still works', async () => {
  const r = await extract([
    [
      [[40, 'CITY DIAGNOSTIC CENTRE', 14, true]],
      [[40, 'Patient : Baby ANU', 8], [330, 'Date : 05-08-2026', 8]],
      [[40, 'Sex : F', 8]],
      [[40, 'INVESTIGATION', 9, true], [230, 'OBSERVED VALUE', 9, true], [330, 'UNITS', 9, true], [420, 'NORMAL RANGE', 9, true]],
      [[40, 'S. Creatinine'], [230, '0.4'], [330, 'mg/dL'], [420, '0.3 - 0.7']],
      [[40, 'Serum Ferritin'], [230, '9'], [330, 'ng/mL'], [420, '7 - 140']],
    ],
  ]);
  assert.equal(r.labId, 'generic');
  assert.equal(r.patientName, 'Anu');
  assert.equal(r.gender, 'female');
  assert.equal(row(r, 'creatinine').value, 0.4);
  assert.deepEqual([row(r, 'ferritin').refLow, row(r, 'ferritin').refHigh], [7, 140]);
});

test('a scanned PDF has no text', async () => {
  const r = parseReport([]);
  assert.equal(r.hasText, false);
  assert.equal(r.rows.length, 0);
});

// ---- Pieces -------------------------------------------------------------------

test('parseValue', () => {
  assert.deepEqual(parseValue('13.5')?.parsed, { value: 13.5, text: '13.5', approx: false, flag: null });
  assert.deepEqual(parseValue('1,85,000 H')?.parsed, { value: 185000, text: '1,85,000', approx: false, flag: 'high' });
  assert.equal(parseValue('6.9 High')?.parsed.flag, 'high');
  assert.equal(parseValue('9 L')?.parsed.flag, 'low');
  assert.equal(parseValue('< 0.5')?.parsed.approx, true);
  assert.equal(parseValue('13.5g/dL')?.rest, 'g/dL');
  assert.equal(parseValue('2.1 Lakhs/cumm')?.parsed.flag, null);
  assert.equal(parseValue('Negative'), null);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('13.0 - 17.0'), { low: 13, high: 17 });
  assert.deepEqual(parseRange('0.4 to 4.0'), { low: 0.4, high: 4 });
  assert.deepEqual(parseRange('< 200'), { low: null, high: 200 });
  assert.deepEqual(parseRange('Up to 40'), { low: null, high: 40 });
  assert.deepEqual(parseRange('>= 60'), { low: 60, high: null });
  assert.deepEqual(parseRange('1,50,000 - 4,10,000'), { low: 150000, high: 410000 });
  assert.deepEqual(parseRange('Normal: 70-100 Prediabetes: 100-125 Diabetes: >=126'), { low: 70, high: 100 });
  assert.deepEqual(parseRange('<5.7 Non-diabetic 5.7-6.4 Pre-diabetic >=6.5 Diabetic'), { low: null, high: 5.7 });
  assert.deepEqual(parseRange('Male: 13-17 Female: 12-15', 'male'), { low: 13, high: 17 });
  assert.equal(parseRange('Male: 13-17 Female: 12-15', null), null);
  assert.equal(parseRange('Adults: 0.4-4.0 Children: 0.7-6.4'), null); // ambiguous: left for the user
  assert.equal(parseRange('High: >240'), null);
  assert.equal(parseRange(''), null);
});

test('parseReportDate', () => {
  assert.equal(parseReportDate('12/Sep/2026 08:15AM'), '2026-09-12');
  assert.equal(parseReportDate('02 Oct 2026, 07:45 AM'), '2026-10-02');
  assert.equal(parseReportDate('05-08-2026'), '2026-08-05');
  assert.equal(parseReportDate('2026-09-12'), '2026-09-12');
  assert.equal(parseReportDate('31/02/2026'), null);
});

test('tidyUnit', () => {
  assert.equal(tidyUnit('mg/dl'), 'mg/dL');
  assert.equal(tidyUnit('gm/dl'), 'g/dL');
  assert.equal(tidyUnit('uIU/mL'), 'µIU/mL');
  assert.equal(tidyUnit('cells/cu.mm'), 'cells/cu.mm');
});

test('matchMember picks the family member named on the report', () => {
  const members = [
    { id: '1', name: 'Ravi Kumar' },
    { id: '2', name: 'Priya Sharma' },
    { id: '3', name: 'Anu Kumar' },
  ];
  assert.equal(matchMember('Priya Sharma', members)?.id, '2');
  assert.equal(matchMember('RAVI KUMAR', members)?.id, '1');
  assert.equal(matchMember('Anu', members)?.id, '3');
  assert.equal(matchMember('Someone Else', members), null);
  assert.equal(matchMember(null, members), null);
});
