import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import type { SQLiteDatabase } from 'expo-sqlite';

import * as DB from './db';
import { readAttachmentBase64, shareFile, writeAttachmentFromBase64 } from './files';
import { ageFrom, escapeHtml, formatDate, safeFileName, todayIso } from './format';
import { RECORD_TYPES, type Attachment, type MedicalRecord, type Member } from './types';

const BUNDLE_FORMAT = 'family-health-registry';
const BUNDLE_VERSION = 1;
const SAFE_FILE_NAME = /^[A-Za-z0-9-]+\.[A-Za-z0-9]{1,8}$/;

type BundleAttachment = Attachment & { data: string };

export type RegistryBundle = {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  members: Member[];
  records: MedicalRecord[];
  attachments: BundleAttachment[];
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
  for (const m of members) {
    for (const { attachmentCount: _count, memberName: _n, memberColor: _c, ...r } of await DB.listRecords(db, m.id)) {
      records.push(r);
      for (const a of await DB.listAttachments(db, r.id)) {
        const data = readAttachmentBase64(a);
        if (data !== null) attachments.push({ ...a, data });
      }
    }
  }

  const bundle: RegistryBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    members,
    records,
    attachments,
  };

  const label = members.length === 1 ? safeFileName(members[0].name) : 'family';
  const file = new File(Paths.cache, `${label}-health-records-${todayIso()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(bundle));
  await shareFile(file.uri, 'application/json', 'Share health records');
  return { members: members.length, records: records.length, attachments: attachments.length };
}

export type ImportResult = {
  membersAdded: number;
  membersUpdated: number;
  recordsAdded: number;
  recordsUpdated: number;
  attachmentsAdded: number;
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
  if (!Array.isArray(b.members) || !Array.isArray(b.records) || !Array.isArray(b.attachments)) {
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
  };

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
        result.recordsAdded++;
      } else if (r.updatedAt > existing.updatedAt) {
        await DB.upsertRecord(db, r);
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
  });

  return result;
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
    ${healthSection('Current medications', m.medications)}
    ${healthSection('Notes', m.notes)}
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
    ${healthSection('Notes', r.notes)}
    ${others.length ? `<h2>Other attached files</h2><ul>${others.map((a) => `<li>${escapeHtml(a.name)}</li>`).join('')}</ul>` : ''}
    ${images ? `<h2>Attached images</h2>${images}` : ''}
    <footer>Family Health Registry</footer>
  </body></html>`;

  await printAndShare(html, `${m?.name ?? 'record'}-${r.title}-${r.date}`);
}
