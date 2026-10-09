import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { syncRemindersQuietly } from '../reminders';
import { toBase64 } from './crypto';
import { runSync, type SyncReport } from './engine';
import { encodeFamilyCode, sameKey, type FamilyCode } from './familyCode';
import { getFamilyKey, getSyncState, saveSyncState, setFamilyKey } from './state';
import { StoreClient, storeToken } from './store';

let running: Promise<SyncReport | null> | null = null;
let lastAutoRun = 0;
const listeners = new Set<() => void>();

const sha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

/** Lets the Sync screen show "Syncing…" and refresh when a round finishes. */
export function onSyncChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const isSyncing = () => running !== null;

async function storeFor(url: string, key: Uint8Array) {
  return new StoreClient(url, await storeToken(key, sha256));
}

/** Runs one sync round (or joins the one in progress). Null when this phone isn't in a family. */
export function syncNow(db: SQLiteDatabase): Promise<SyncReport | null> {
  if (running) return running;
  running = (async () => {
    const key = await getFamilyKey();
    const state = await getSyncState(db);
    if (!key || !state.url) return null;
    const report = await runSync({ db, store: await storeFor(state.url, key), key, random: (n) => Crypto.getRandomBytes(n), sha256 });
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

const newDeviceId = () =>
  toBase64(Crypto.getRandomBytes(12)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function joinStore(db: SQLiteDatabase, url: string, key: Uint8Array, deviceName: string) {
  const state = await getSyncState(db);
  await setFamilyKey(key);
  await saveSyncState(db, {
    url,
    deviceId: state.deviceId || newDeviceId(),
    deviceName: state.deviceName || deviceName,
    phones: [],
    // Everything is sent again, encrypted with this family's key.
    lastHash: null,
    lastError: null,
  });
}

/**
 * The main family member connects the storage script they deployed. The
 * first connection claims it for a new family key; a storage that already
 * belongs to another family code is refused.
 */
export async function startFamily(db: SQLiteDatabase, url: string, deviceName: string) {
  const key = Crypto.getRandomBytes(32);
  await (await storeFor(url, key)).hello();
  await joinStore(db, url, key, deviceName);
}

/** Uses a family member's code. Joining a different family replaces this phone's family key (its records stay on the phone). */
export async function joinWithCode(db: SQLiteDatabase, code: FamilyCode, deviceName: string) {
  await (await storeFor(code.url, code.key)).hello();
  await joinStore(db, code.url, code.key, deviceName);
}

/** True when a scanned code belongs to a different family than this phone's. */
export async function isOtherFamily(code: FamilyCode) {
  const current = await getFamilyKey();
  return !!current && !sameKey(current, code.key);
}

/** True when a scanned code is the one this phone already uses. */
export async function isSameFamily(code: FamilyCode) {
  const current = await getFamilyKey();
  return !!current && sameKey(current, code.key);
}

export async function myFamilyCode(db: SQLiteDatabase) {
  const key = await getFamilyKey();
  const state = await getSyncState(db);
  if (!key || !state.url) return null;
  return encodeFamilyCode({ key, url: state.url, name: state.deviceName || 'Family phone' });
}

/** Stops syncing on this phone. Records stay; the family's files stay in the storage. */
export async function leaveFamily(db: SQLiteDatabase) {
  await setFamilyKey(null);
  await saveSyncState(db, { url: '', phones: [], lastHash: null, lastError: null });
}
