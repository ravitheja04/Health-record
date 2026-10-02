import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import type { SQLiteDatabase } from 'expo-sqlite';

import * as DB from './db';
import { buildSeries, formatRange, formatValue, statusOf } from './labAnalysis';
import * as Labs from './labs';
import { isCurrent, scheduleText } from './medSchedule';
import * as Meds from './meds';
import { sortVaccinations, vaccineStatus } from './vaccineAnalysis';
import * as Vax from './vaccines';
import { readAttachmentBase64, shareFile, writeAttachmentFromBase64 } from './files';
import { ageFrom, escapeHtml, formatDate, safeFileName, todayIso } from './format';
import { RECORD_TYPES, type Attachment, type DoseLog, type LabResult, type MedicalRecord, type Medication, type Member, type Vaccination } from './types';

const BUNDLE_FORMAT = 'family-health-registry';
/** v2 added lab results, v3 medicines, v4 vaccinations; older files still import. */
const BUNDLE_VERSION = 4;
const SAFE_FILE_NAME = /^[A-Za-z0-9-]+\.[A-Za-z0-9]{1,8}$/;

type BundleAttachment = Attachment & { data: string };

export type RegistryBundle = {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  members: Member[];
  records: MedicalRecord[];
  attachments: BundleAttachment[];
  labResults?: LabResult[];
  medications?: Medication[];
  doseLogs?: DoseLog[];
  vaccinations?: Vaccination[];
};

// ---- Family data file (share with other family members) ---------------------

/**
 * Packs the given members (or everyone) with all their records and attachment
 * files into a single `.json` file and opens the share sheet, so it can be sent
 * over WhatsApp, email, AirDrop, Nearby Share, Drive, etc.
 */
export async function shareRegistryBundle(db: SQLiteDatabase, memberIds?: string[]) {
  const allMembers = await DB.listMembers(db);
  const members = allMembers
    .filter((m) => !memberIds || memberIds.includes(m.id))
    .map(({ recordCount: _count, ...m }) => m);

  const records: MedicalRecord[] = [];
  const attachments: BundleAttachment[] = [];
  const labResults: LabResult[] = [];
  const medications: Medication[] = [];
  const vaccinations: Vaccination[] = [];
  for (const m of members) {
    for (const { memberName: _n, memberColor: _c, ...v } of await Vax.listVaccinations(db, m.id)) vaccinations.push(v);
    for (const { memberName: _n, memberColor: _c, ...med } of await Meds.listMedications(db, m.id)) medications.push(med);
    for (const { attachmentCount: _count, memberName: _n, memberColor: _c, ...r } of await DB.listRecords(db, m.id)) {
      records.push(r);
      labResults.push(...(await Labs.listResultsForRecord(db, r.id)));
      for (const a of await DB.listAttachments(db, r.id)) {
        const data = readAttachmentBase64(a);
        if (data !== null) attachments.push({ ...a, data });
      }
    }
  }

  const doseLogs = await Meds.listAllDoseLogs(db, medications.map((m) => m.id));

  const bundle: RegistryBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    members,
    records,
    attachments,
    labResults,
    medications,
    doseLogs,
    vaccinations,
  };

  const label = members.length === 1 ? safeFileName(members[0].name) : 'family';
  const file = new File(Paths.cache, `${label}-health-records-${todayIso()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(bundle));
  await shareFile(file.uri, 'application/json', 'Share health records');
  return {
    members: members.length,
    records: records.length,
    attachments: attachments.length,
    labResults: labResults.length,
    medications: medications.length,
    vaccinations: vaccinations.length,
  };
}

export type ImportResult = {
  membersAdded: number;
  membersUpdated: number;
  recordsAdded: number;
  recordsUpdated: number;
  attachmentsAdded: number;
  labResultsImported: number;
  medicationsAdded: number;
  medicationsUpdated: number;
  vaccinationsAdded: number;
  vaccinationsUpdated: number;
};

function parseBundle(text: string): RegistryBundle {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Family Health Registry export.');
  }
  const b = data as Partial<RegistryBundle>;
  if (b?.format !== BUNDLE_FORMAT) throw new Error('This file is not a Family Health Registry export.');
  if (typeof b.version !== 'number' || b.version > BUNDLE_VERSION) {
    throw new Error('This file was made by a newer version of the app. Please update the app and try again.');
  }
  if (
    !Array.isArray(b.members) ||
    !Array.isArray(b.records) ||
    !Array.isArray(b.attachments) ||
    (b.labResults !== undefined && !Array.isArray(b.labResults)) ||
    (b.medications !== undefined && !Array.isArray(b.medications)) ||
    (b.doseLogs !== undefined && !Array.isArray(b.doseLogs)) ||
    (b.vaccinations !== undefined && !Array.isArray(b.vaccinations))
  ) {
    throw new Error('The export file is incomplete or damaged.');
  }
  return b as RegistryBundle;
}

/**
 * Merges a shared file into this device. Entries are matched by id; when both
 * sides have the same member or record, the most recently edited copy wins.
 */
export async function importRegistryBundle(db: SQLiteDatabase, uri: string): Promise<ImportResult> {
  const bundle = parseBundle(await new File(uri).text());
  const result: ImportResult = {
    membersAdded: 0,
    membersUpdated: 0,
    recordsAdded: 0,
    recordsUpdated: 0,
    attachmentsAdded: 0,
    labResultsImported: 0,
    medicationsAdded: 0,
    medicationsUpdated: 0,
    vaccinationsAdded: 0,
    vaccinationsUpdated: 0,
  };
  // Records whose shared copy won the merge; their lab results are taken from the file too.
  const recordsTaken = new Set<string>();

  await db.withTransactionAsync(async () => {
    for (const m of bundle.members) {
      const existing = await DB.getMember(db, m.id);
      if (!existing) {
        await DB.upsertMember(db, m);
        result.membersAdded++;
      } else if (m.updatedAt > existing.updatedAt) {
        await DB.upsertMember(db, m);
        result.membersUpdated++;
      }
    }

    for (const r of bundle.records) {
      if (!(await DB.getMember(db, r.memberId))) continue;
      const existing = await DB.getRecord(db, r.id);
      if (!existing) {
        await DB.upsertRecord(db, r);
        recordsTaken.add(r.id);
        result.recordsAdded++;
      } else if (r.updatedAt > existing.updatedAt) {
        await DB.upsertRecord(db, r);
        recordsTaken.add(r.id);
        result.recordsUpdated++;
      }
    }

    for (const { data, ...a } of bundle.attachments) {
      // The file name becomes a path on disk, so never trust it from a shared file.
      if (!SAFE_FILE_NAME.test(a.fileName) || typeof data !== 'string') continue;
      if (!(await DB.getRecord(db, a.recordId))) continue;
      const exists = await db.getFirstAsync('SELECT id FROM attachments WHERE id = ?', a.id);
      if (exists) continue;
      writeAttachmentFromBase64(a, data);
      await DB.insertAttachment(db, a);
      result.attachmentsAdded++;
    }

    // Files from app versions before lab results carry none; keep this phone's results then.
    if (bundle.labResults) {
      const shared = bundle.labResults.filter(isValidLabResult);
      for (const recordId of recordsTaken) {
        const forRecord = shared.filter((l) => l.recordId === recordId);
        await Labs.replaceResultsForRecord(db, recordId, forRecord);
        result.labResultsImported += forRecord.length;
      }
    }

    for (const med of (bundle.medications ?? []).filter(isValidMedication)) {
      if (!(await DB.getMember(db, med.memberId))) continue;
      const existing = await Meds.getMedication(db, med.id);
      if (!existing) {
        // Reminders are per phone: shared medicines stay quiet here until turned on.
        await Meds.upsertMedication(db, { ...med, remindersOn: false });
        result.medicationsAdded++;
      } else if (med.updatedAt > existing.updatedAt) {
        await Meds.upsertMedication(db, { ...med, remindersOn: existing.remindersOn });
        result.medicationsUpdated++;
      }
    }
    for (const log of (bundle.doseLogs ?? []).filter(isValidDoseLog)) {
      if (await Meds.getMedication(db, log.medicationId)) await Meds.insertDoseLogIfMissing(db, log);
    }

    for (const v of (bundle.vaccinations ?? []).filter(isValidVaccination)) {
      if (!(await DB.getMember(db, v.memberId))) continue;
      // Keep the certificate link only if that record exists on this phone.
      const recordId = v.recordId && (await DB.getRecord(db, v.recordId)) ? v.recordId : null;
      const existing = await Vax.getVaccination(db, v.id);
      if (!existing) {
        await Vax.upsertVaccination(db, { ...v, recordId });
        result.vaccinationsAdded++;
      } else if (v.updatedAt > existing.updatedAt) {
        await Vax.upsertVaccination(db, { ...v, recordId: recordId ?? existing.recordId });
        result.vaccinationsUpdated++;
      }
    }
  });

  return result;
}

const isDateText = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTimeText = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function isValidMedication(v: unknown): v is Medication {
  const m = v as Medication;
  return (
    !!m &&
    typeof m.id === 'string' &&
    typeof m.memberId === 'string' &&
    typeof m.name === 'string' &&
    typeof m.dose === 'string' &&
    typeof m.instructions === 'string' &&
    Array.isArray(m.times) &&
    m.times.every(isTimeText) &&
    (m.frequency === 'daily' || m.frequency === 'weekly') &&
    Array.isArray(m.days) &&
    m.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    isDateText(m.startDate) &&
    (m.endDate === null || isDateText(m.endDate)) &&
    (m.stock === null || (typeof m.stock === 'number' && Number.isFinite(m.stock))) &&
    typeof m.perDose === 'number' &&
    m.perDose > 0 &&
    typeof m.notes === 'string' &&
    typeof m.createdAt === 'string' &&
    typeof m.updatedAt === 'string'
  );
}

function isValidVaccination(v: unknown): v is Vaccination {
  const x = v as Vaccination;
  const optionalDate = (d: unknown) => d === null || isDateText(d);
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.memberId === 'string' &&
    typeof x.name === 'string' &&
    typeof x.dose === 'string' &&
    optionalDate(x.dueDate) &&
    optionalDate(x.givenDate) &&
    typeof x.facility === 'string' &&
    typeof x.notes === 'string' &&
    (x.recordId === null || typeof x.recordId === 'string') &&
    (x.scheduleKey === null || typeof x.scheduleKey === 'string') &&
    typeof x.createdAt === 'string' &&
    typeof x.updatedAt === 'string'
  );
}

function isValidDoseLog(v: unknown): v is DoseLog {
  const l = v as DoseLog;
  return (
    !!l &&
    typeof l.id === 'string' &&
    typeof l.medicationId === 'string' &&
    isDateText(l.date) &&
    isTimeText(l.time) &&
    (l.status === 'taken' || l.status === 'skipped') &&
    typeof l.loggedAt === 'string'
  );
}

function isValidLabResult(l: unknown): l is LabResult {
  const r = l as LabResult;
  const optionalNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
  return (
    !!r &&
    typeof r.id === 'string' &&
    typeof r.recordId === 'string' &&
    typeof r.testKey === 'string' &&
    typeof r.testName === 'string' &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    typeof r.unit === 'string' &&
    optionalNumber(r.refLow) &&
    optionalNumber(r.refHigh) &&
    typeof r.createdAt === 'string'
  );
}

// ---- PDF summaries (share with doctors, hospitals, anyone) -----------------

const PDF_STYLES = `
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #0F172A; padding: 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 24px 0 8px; border-bottom: 2px solid #E2E8F0; padding-bottom: 4px; }
  .muted { color: #64748B; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  th { background: #F1F5F9; }
  .grid td:first-child { width: 34%; color: #475569; font-weight: 600; }
  .high { color: #C2410C; font-weight: 700; }
  .alert { background: #FEF2F2; border: 1px solid #FECACA; padding: 8px 12px; border-radius: 6px; }
  .pre { white-space: pre-wrap; }
  img { max-width: 100%; margin-top: 12px; border: 1px solid #E2E8F0; }
  footer { margin-top: 32px; font-size: 11px; color: #94A3B8; }
`;

function profileRows(m: Member) {
  const age = ageFrom(m.dob);
  const rows: [string, string][] = [
    ['Relation', m.relation],
    ['Date of birth', m.dob ? `${formatDate(m.dob)}${age !== null ? ` (${age} yrs)` : ''}` : ''],
    ['Gender', m.gender ?? ''],
    ['Blood group', m.bloodGroup ?? ''],
    ['Emergency contact', m.emergencyContact],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');
}

function healthSection(title: string, value: string, alert = false) {
  if (!value.trim()) return '';
  return `<h2>${escapeHtml(title)}</h2><div class="pre ${alert ? 'alert' : ''}">${escapeHtml(value)}</div>`;
}

function labTable(rows: { name: string; value: number; unit: string; refLow: number | null; refHigh: number | null; date?: string }[]) {
  if (!rows.length) return '';
  const body = rows
    .map((r) => {
      const status = statusOf(r.value, r.refLow, r.refHigh);
      const flag = status === 'high' ? 'High' : status === 'low' ? 'Low' : '';
      return `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td class="${flag ? 'high' : ''}">${escapeHtml(formatValue(r.value))} ${escapeHtml(r.unit)}${flag ? ` (${flag})` : ''}</td>
        <td>${escapeHtml(formatRange(r.refLow, r.refHigh, r.unit))}</td>
        ${r.date !== undefined ? `<td>${escapeHtml(formatDate(r.date))}</td>` : ''}
      </tr>`;
    })
    .join('');
  const dateHead = rows[0].date !== undefined ? '<th>Tested</th>' : '';
  return `<table><tr><th>Test</th><th>Result</th><th>Normal range</th>${dateHead}</tr>${body}</table>`;
}

async function printAndShare(html: string, baseName: string) {
  const { uri } = await Print.printToFileAsync({ html });
  const dest = new File(Paths.cache, `${safeFileName(baseName)}.pdf`);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);
  await shareFile(dest.uri, 'application/pdf', 'Share PDF');
}

export async function shareMemberSummaryPdf(db: SQLiteDatabase, memberId: string) {
  const m = await DB.getMember(db, memberId);
  if (!m) throw new Error('Family member not found.');
  const records = await DB.listRecords(db, memberId);
  const meds = (await Meds.listMedications(db, memberId)).filter((md) => isCurrent(md, todayIso()));
  const vaccines = sortVaccinations(await Vax.listVaccinations(db, memberId), todayIso());
  const givenVaccines = vaccines.filter((v) => v.givenDate);
  const dueVaccines = vaccines.filter((v) => !v.givenDate && v.dueDate);
  const latestLabs = buildSeries(await Labs.listMemberResults(db, memberId)).map((s) => ({
    name: s.testName,
    value: s.latest.value,
    unit: s.latest.unit,
    refLow: s.latest.refLow,
    refHigh: s.latest.refHigh,
    date: s.latest.date,
  }));

  const rows = records
    .map(
      (r) => `<tr>
        <td>${escapeHtml(formatDate(r.date))}</td>
        <td>${escapeHtml(RECORD_TYPES[r.type]?.label ?? r.type)}</td>
        <td><b>${escapeHtml(r.title)}</b>${r.notes ? `<div class="muted pre">${escapeHtml(r.notes)}</div>` : ''}</td>
        <td>${escapeHtml([r.doctor, r.facility].filter(Boolean).join(', '))}</td>
      </tr>`
    )
    .join('');

  const html = `<html><head><meta charset="utf-8"><style>${PDF_STYLES}</style></head><body>
    <h1>${escapeHtml(m.name)}</h1>
    <div class="muted">Health summary · generated ${escapeHtml(formatDate(todayIso()))}</div>
    <h2>Profile</h2><table class="grid">${profileRows(m)}</table>
    ${healthSection('Allergies', m.allergies, true)}
    ${healthSection('Medical conditions', m.conditions)}
    ${
      meds.length
        ? `<h2>Current medicines</h2><table><tr><th>Medicine</th><th>Dose</th><th>When</th></tr>${meds
            .map(
              (md) =>
                `<tr><td>${escapeHtml(md.name)}</td><td>${escapeHtml(md.dose)}</td><td>${escapeHtml(
                  [scheduleText(md), md.instructions].filter(Boolean).join(' · ')
                )}</td></tr>`
            )
            .join('')}</table>`
        : ''
    }
    ${healthSection(meds.length ? 'Other medication notes' : 'Current medications', m.medications)}
    ${healthSection('Notes', m.notes)}
    ${latestLabs.length ? `<h2>Latest lab results</h2>${labTable(latestLabs)}` : ''}
    ${
      givenVaccines.length
        ? `<h2>Vaccinations given (${givenVaccines.length})</h2><table><tr><th>Vaccine</th><th>Dose</th><th>Given</th><th>Where</th></tr>${givenVaccines
            .map(
              (v) =>
                `<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.dose)}</td><td>${escapeHtml(formatDate(v.givenDate))}</td><td>${escapeHtml(v.facility)}</td></tr>`
            )
            .join('')}</table>`
        : ''
    }
    ${
      dueVaccines.length
        ? `<h2>Vaccinations due</h2><table><tr><th>Vaccine</th><th>Dose</th><th>Due</th></tr>${dueVaccines
            .map(
              (v) =>
                `<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.dose)}</td><td class="${vaccineStatus(v, todayIso()) === 'overdue' ? 'high' : ''}">${escapeHtml(formatDate(v.dueDate))}${vaccineStatus(v, todayIso()) === 'overdue' ? ' (overdue)' : ''}</td></tr>`
            )
            .join('')}</table>`
        : ''
    }
    <h2>Medical history (${records.length})</h2>
    ${records.length ? `<table><tr><th>Date</th><th>Type</th><th>Details</th><th>Doctor / Facility</th></tr>${rows}</table>` : '<div class="muted">No records yet.</div>'}
    <footer>Family Health Registry</footer>
  </body></html>`;

  await printAndShare(html, `${m.name}-health-summary`);
}

export async function shareRecordPdf(db: SQLiteDatabase, recordId: string) {
  const r = await DB.getRecord(db, recordId);
  if (!r) throw new Error('Record not found.');
  const m = await DB.getMember(db, r.memberId);
  const attachments = await DB.listAttachments(db, recordId);
  const results = await Labs.listResultsForRecord(db, recordId);

  const images = attachments
    .filter((a) => a.mimeType.startsWith('image/'))
    .map((a) => {
      const data = readAttachmentBase64(a);
      return data ? `<img src="data:${escapeHtml(a.mimeType)};base64,${data}" />` : '';
    })
    .join('');
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/'));

  const rows: [string, string][] = [
    ['Patient', m?.name ?? ''],
    ['Type', RECORD_TYPES[r.type]?.label ?? r.type],
    ['Date', formatDate(r.date)],
    ['Doctor', r.doctor],
    ['Hospital / Lab', r.facility],
  ];

  const html = `<html><head><meta charset="utf-8"><style>${PDF_STYLES}</style></head><body>
    <h1>${escapeHtml(r.title)}</h1>
    <table class="grid">${rows
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
      .join('')}</table>
    ${m?.allergies.trim() ? `<h2>Known allergies</h2><div class="alert pre">${escapeHtml(m.allergies)}</div>` : ''}
    ${results.length ? `<h2>Test results</h2>${labTable(results.map((l) => ({ name: l.testName, value: l.value, unit: l.unit, refLow: l.refLow, refHigh: l.refHigh })))}` : ''}
    ${healthSection('Notes', r.notes)}
    ${others.length ? `<h2>Other attached files</h2><ul>${others.map((a) => `<li>${escapeHtml(a.name)}</li>`).join('')}</ul>` : ''}
    ${images ? `<h2>Attached images</h2>${images}` : ''}
    <footer>Family Health Registry</footer>
  </body></html>`;

  await printAndShare(html, `${m?.name ?? 'record'}-${r.title}-${r.date}`);
}
