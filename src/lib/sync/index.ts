import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { syncRemindersQuietly } from '../reminders';
import { DriveClient } from './drive';
import { encodeFamilyCode, sameKey, type FamilyCode } from './familyCode';
import { dropGoogleToken, googleAccessToken, googleApiKey, syncConfigured } from './google';
import { runSync, type SyncReport } from './engine';
import { getFamilyKey, getSyncState, saveSyncState, setFamilyKey } from './state';

export { syncConfigured };

let running: Promise<SyncReport | null> | null = null;
let lastAutoRun = 0;
const listeners = new Set<() => void>();

/** Lets the Sync screen show "Syncing…" and refresh when a round finishes. */
export function onSyncChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const isSyncing = () => running !== null;

/** Runs one sync round (or joins the one in progress). Null when sync isn't set up. */
export function syncNow(db: SQLiteDatabase): Promise<SyncReport | null> {
  if (running) return running;
  running = (async () => {
    const key = syncConfigured ? await getFamilyKey() : null;
    if (!key) return null;
    const token = await googleAccessToken();
    const drive = new DriveClient({ getToken: googleAccessToken, dropToken: dropGoogleToken, apiKey: googleApiKey });
    const report = await runSync({
      db,
      drive,
      key,
      random: (n) => Crypto.getRandomBytes(n),
      sha256: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
      canUpload: token !== null,
    });
    if (report.received.some((r) => r.changed)) syncRemindersQuietly(db);
    return report;
  })().finally(() => {
    running = null;
    listeners.forEach((l) => l());
  });
  listeners.forEach((l) => l());
  return running;
}

/** For app open / return to the app: at most every 2 minutes, errors kept for the Sync screen. */
export function syncQuietly(db: SQLiteDatabase) {
  if (Date.now() - lastAutoRun < 120_000) return;
  lastAutoRun = Date.now();
  syncNow(db).catch(() => {});
}

/** The main family member's phone starts the family; the family's records live in its Drive. */
export async function startFamily(db: SQLiteDatabase, deviceName: string) {
  await setFamilyKey(Crypto.getRandomBytes(32));
  await saveSyncState(db, { role: 'owner', deviceName, peers: [], lastHash: null });
}

export type JoinResult = 'joined' | 'added' | 'member-code' | 'own-code' | 'owner-not-ready';

/**
 * Uses a scanned or pasted family code.
 * - The owner's code: this phone joins as a member and reads the family's records
 *   from the owner's Drive. Joining a different family replaces this phone's
 *   family key (its records stay on the phone).
 * - A member's code, scanned on the owner's phone: the owner starts collecting
 *   that member's changes.
 */
export async function joinWithCode(db: SQLiteDatabase, code: FamilyCode, deviceName: string): Promise<JoinResult> {
  const current = await getFamilyKey();
  const state = await getSyncState(db);
  const switching = !current || !sameKey(current, code.key);

  if (code.owner) {
    if (!switching && state.role === 'owner' && code.fileId === state.myFileId) return 'own-code';
    if (!code.fileId) return 'owner-not-ready';
    if (switching) await setFamilyKey(code.key);
    await saveSyncState(db, {
      role: 'member',
      deviceName: state.deviceName || deviceName,
      peers: [{ fileId: code.fileId, name: code.name, lastModified: null }],
      // A new key or role means everything must be uploaded again.
      lastHash: null,
    });
    if (switching) await db.runAsync('DELETE FROM sync_files');
    return 'joined';
  }

  if (switching || state.role !== 'owner') return 'member-code';
  const peers = state.peers;
  if (code.fileId && code.fileId !== state.myFileId && !peers.some((p) => p.fileId === code.fileId)) {
    peers.push({ fileId: code.fileId, name: code.name, lastModified: null });
    await saveSyncState(db, { peers });
  }
  return 'added';
}

/** True when a scanned code belongs to a different family than this phone's. */
export async function isOtherFamily(code: FamilyCode) {
  const current = await getFamilyKey();
  return !!current && !sameKey(current, code.key);
}

export async function myFamilyCode(db: SQLiteDatabase) {
  const key = await getFamilyKey();
  if (!key) return null;
  const state = await getSyncState(db);
  return encodeFamilyCode({ key, fileId: state.myFileId, name: state.deviceName || 'Family phone', owner: state.role === 'owner' });
}

export async function removeFamilyPhone(db: SQLiteDatabase, fileId: string) {
  const state = await getSyncState(db);
  await saveSyncState(db, { peers: state.peers.filter((p) => p.fileId !== fileId) });
}

/** Stops syncing on this phone. Records stay; the Drive files stay until deleted in Drive. */
export async function leaveFamily(db: SQLiteDatabase) {
  await setFamilyKey(null);
  await saveSyncState(db, { role: 'owner', peers: [], myFileId: null, lastHash: null, lastError: null });
  await db.runAsync('DELETE FROM sync_files');
}
