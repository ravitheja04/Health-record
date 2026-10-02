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

export async function startFamily(db: SQLiteDatabase, deviceName: string) {
  await setFamilyKey(Crypto.getRandomBytes(32));
  await saveSyncState(db, { deviceName, peers: [], lastHash: null });
}

/**
 * Uses a family member's code. Joining a different family replaces this
 * phone's family key (its records stay on the phone).
 */
export async function joinWithCode(db: SQLiteDatabase, code: FamilyCode, deviceName: string) {
  const current = await getFamilyKey();
  const state = await getSyncState(db);
  const switching = !current || !sameKey(current, code.key);
  if (switching) await setFamilyKey(code.key);
  const peers = switching ? [] : state.peers;
  if (code.fileId && code.fileId !== state.myFileId && !peers.some((p) => p.fileId === code.fileId)) {
    peers.push({ fileId: code.fileId, name: code.name, lastModified: null });
  }
  // A new key means everything must be uploaded again, encrypted with it.
  await saveSyncState(db, { deviceName: state.deviceName || deviceName, peers, ...(switching ? { lastHash: null } : {}) });
  if (switching) await db.runAsync('DELETE FROM sync_files');
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
  return encodeFamilyCode({ key, fileId: state.myFileId, name: state.deviceName || 'Family phone' });
}

export async function removeFamilyPhone(db: SQLiteDatabase, fileId: string) {
  const state = await getSyncState(db);
  await saveSyncState(db, { peers: state.peers.filter((p) => p.fileId !== fileId) });
}

/** Stops syncing on this phone. Records stay; the Drive files stay until deleted in Drive. */
export async function leaveFamily(db: SQLiteDatabase) {
  await setFamilyKey(null);
  await saveSyncState(db, { peers: [], myFileId: null, lastHash: null, lastError: null });
  await db.runAsync('DELETE FROM sync_files');
}
