import type { SQLiteDatabase } from 'expo-sqlite';

import { readAttachmentBase64 } from '../files';
import { addSyncedAttachment, buildRegistryBundle, mergeRegistryBundle, validateBundle } from '../share';
import { decrypt, encrypt, fromBase64, toBase64, utf8, WrongKeyError } from './crypto';
import { attachmentFile, isPhoneFile, isSnapshot, phoneFile, snapshotFingerprintText, type Snapshot } from './snapshot';
import { getSyncState, saveSyncState, type FamilyPhone } from './state';
import type { StoreClient } from './store';
import { t } from '../../i18n';

export type SyncDeps = {
  db: SQLiteDatabase;
  store: Pick<StoreClient, 'list' | 'get' | 'put'>;
  key: Uint8Array;
  random: (n: number) => Uint8Array;
  sha256: (text: string) => Promise<string>;
};

export type SyncReport = {
  received: { name: string; changed: boolean }[];
  uploaded: boolean;
  filesUploaded: number;
  filesReceived: number;
  problems: string[];
};

/** Photos and PDFs bigger than this stay on the phone (the storage script handles up to about 50 MB of text). */
export const MAX_SHARED_FILE_BYTES = 15 * 1024 * 1024;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One round of family sync through the family storage: read every other
 * family phone's records (and any photos/PDFs this phone lacks) and merge
 * them, then send this phone's records and new files if they changed.
 */
export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const { db, store, key } = deps;
  const state = await getSyncState(db);
  const report: SyncReport = { received: [], uploaded: false, filesUploaded: 0, filesReceived: 0, problems: [] };

  let files;
  try {
    files = await store.list();
  } catch (e) {
    report.problems.push(message(e));
    await saveSyncState(db, { lastSyncAt: new Date().toISOString(), lastError: report.problems[0] });
    return report;
  }
  const stored = new Set(files.map((f) => f.name));
  const myFile = phoneFile(state.deviceId);
  const known = new Map(state.phones.map((p) => [p.file, p]));

  // ---- Receive ----------------------------------------------------------------
  const phones: FamilyPhone[] = [];
  for (const f of files) {
    if (!isPhoneFile(f.name) || f.name === myFile) continue;
    const prev = known.get(f.name);
    if (prev && prev.lastModified === f.modified && !prev.lastError) {
      phones.push(prev);
      report.received.push({ name: prev.name, changed: false });
      continue;
    }
    try {
      const text = await store.get(f.name);
      if (text === null) continue;
      const snapshot: unknown = JSON.parse(utf8.decode(decrypt(key, text)));
      if (!isSnapshot(snapshot)) throw new Error(t('Not a family sync file.'));
      const { missingFiles } = await mergeRegistryBundle(db, validateBundle(snapshot.bundle));
      // A file the other phone hasn't sent yet: look at that phone again next time.
      let waiting = false;
      for (const a of missingFiles) {
        const name = attachmentFile(a.id);
        if (!stored.has(name)) {
          waiting = true;
          continue;
        }
        try {
          const enc = await store.get(name);
          if (enc !== null && (await addSyncedAttachment(db, a, toBase64(decrypt(key, enc))))) report.filesReceived++;
        } catch (e) {
          waiting = true;
          report.problems.push(`${t('A file from {name}', { name: snapshot.deviceName })}: ${message(e)}`);
        }
      }
      const name = snapshot.deviceName || prev?.name || t('Family phone');
      phones.push({ file: f.name, name, lastModified: waiting ? null : f.modified, lastError: null });
      report.received.push({ name, changed: true });
    } catch (e) {
      const text = e instanceof WrongKeyError ? t('Uses a different family code. Ask them to join with yours.') : message(e);
      const name = prev?.name ?? t('Family phone');
      phones.push({ file: f.name, name, lastModified: prev?.lastModified ?? null, lastError: text });
      report.problems.push(`${name}: ${text}`);
    }
  }
  await saveSyncState(db, { phones });

  // ---- Send -------------------------------------------------------------------
  try {
    await upload(deps, state.deviceName, myFile, stored, state.lastHash, report);
  } catch (e) {
    report.problems.push(`${t('Sending')}: ${message(e)}`);
  }

  await saveSyncState(db, { lastSyncAt: new Date().toISOString(), lastError: report.problems[0] ?? null });
  return report;
}

async function upload(deps: SyncDeps, deviceName: string, myFile: string, stored: Set<string>, lastHash: string | null, report: SyncReport) {
  const { db, store, key, random } = deps;
  const bundle = await buildRegistryBundle(db, undefined, false);

  // Photos and PDFs go up once each, as their own encrypted files.
  for (const a of bundle.attachments) {
    const name = attachmentFile(a.id);
    if (stored.has(name)) continue;
    const base64 = readAttachmentBase64(a);
    if (base64 === null) continue;
    const bytes = fromBase64(base64);
    if (bytes.length > MAX_SHARED_FILE_BYTES) {
      report.problems.push(t('“{name}” is too big to share with the family (over 15 MB). It stays on this phone.', { name: a.name }));
      continue;
    }
    await store.put(name, encrypt(key, bytes, random));
    report.filesUploaded++;
  }

  const body: Omit<Snapshot, 'updatedAt'> = { format: 'fhr-sync', version: 2, deviceName, bundle };
  const hash = await deps.sha256(snapshotFingerprintText(body));
  if (hash === lastHash && stored.has(myFile)) return;
  await store.put(myFile, encrypt(key, utf8.encode(JSON.stringify({ ...body, updatedAt: new Date().toISOString() })), random));
  await saveSyncState(db, { lastHash: hash });
  report.uploaded = true;
}
