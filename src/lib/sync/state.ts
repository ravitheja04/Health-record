import type { SQLiteDatabase } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

import { getSetting, setSetting } from '../settings';
import { fromBase64, toBase64 } from './crypto';

/** Another family phone, as seen in the family storage. */
export type FamilyPhone = {
  /** Its file in the storage, e.g. "phone-3f9a….enc". */
  file: string;
  name: string;
  /** When that file last changed; unchanged files aren't downloaded again. */
  lastModified: string | null;
  lastError?: string | null;
};

/** Family sync state on this phone. The family key lives in the phone's secure keystore. */
export type SyncState = {
  /** The family storage's web app link. */
  url: string;
  /** Random id naming this phone's file in the storage. */
  deviceId: string;
  deviceName: string;
  phones: FamilyPhone[];
  /** Fingerprint of what was last uploaded, so an unchanged phone doesn't upload again. */
  lastHash: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

const KEY_STORE = 'family-sync-key';

export async function getFamilyKey(): Promise<Uint8Array | null> {
  const v = await SecureStore.getItemAsync(KEY_STORE);
  return v ? fromBase64(v) : null;
}

export async function setFamilyKey(key: Uint8Array | null) {
  if (key) await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  else await SecureStore.deleteItemAsync(KEY_STORE);
}

const KEYS: Record<keyof SyncState, string> = {
  url: 'sync.storeUrl',
  deviceId: 'sync.deviceId',
  deviceName: 'sync.deviceName',
  phones: 'sync.phones',
  lastHash: 'sync.lastHash',
  lastSyncAt: 'sync.lastSyncAt',
  lastError: 'sync.lastError',
};

export async function getSyncState(db: SQLiteDatabase): Promise<SyncState> {
  const fields = Object.keys(KEYS) as (keyof SyncState)[];
  const values = await Promise.all(fields.map((k) => getSetting(db, KEYS[k])));
  const v = Object.fromEntries(fields.map((k, i) => [k, values[i]])) as Record<keyof SyncState, string | null>;
  let phones: FamilyPhone[] = [];
  try {
    phones = v.phones ? (JSON.parse(v.phones) as FamilyPhone[]) : [];
  } catch {
    phones = [];
  }
  // Cleared values are stored as ''.
  return {
    url: v.url ?? '',
    deviceId: v.deviceId ?? '',
    deviceName: v.deviceName ?? '',
    phones,
    lastHash: v.lastHash || null,
    lastSyncAt: v.lastSyncAt || null,
    lastError: v.lastError || null,
  };
}

export async function saveSyncState(db: SQLiteDatabase, patch: Partial<SyncState>) {
  for (const [k, v] of Object.entries(patch) as [keyof SyncState, unknown][]) {
    const value = v === null || v === undefined ? '' : k === 'phones' ? JSON.stringify(v) : String(v);
    await setSetting(db, KEYS[k], value);
  }
}
