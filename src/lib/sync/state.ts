import type { SQLiteDatabase } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

import { getSetting, setSetting } from '../settings';
import { fromBase64, toBase64 } from './crypto';
import type { Peer } from './snapshot';

/**
 * The main family member's phone keeps the family's data in their Google
 * Drive ("owner"); everyone else reads it from there ("member").
 */
export type SyncRole = 'owner' | 'member';

/** Family sync state on this phone. The family key lives in the phone's secure keystore. */
export type SyncState = {
  role: SyncRole;
  deviceName: string;
  myFileId: string | null;
  folderId: string | null;
  peers: Peer[];
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

export async function getSyncState(db: SQLiteDatabase): Promise<SyncState> {
  const [role, deviceName, myFileId, folderId, peers, lastHash, lastSyncAt, lastError] = await Promise.all(
    ['sync.role', 'sync.deviceName', 'sync.myFileId', 'sync.folderId', 'sync.peers', 'sync.lastHash', 'sync.lastSyncAt', 'sync.lastError'].map((k) => getSetting(db, k))
  );
  let parsed: Peer[] = [];
  try {
    parsed = peers ? (JSON.parse(peers) as Peer[]) : [];
  } catch {
    parsed = [];
  }
  // Cleared values are stored as ''.
  return {
    // Phones set up before roles existed started their own family: treat them as owners.
    role: role === 'member' ? 'member' : 'owner',
    deviceName: deviceName ?? '',
    myFileId: myFileId || null,
    folderId: folderId || null,
    peers: parsed,
    lastHash: lastHash || null,
    lastSyncAt: lastSyncAt || null,
    lastError: lastError || null,
  };
}

export async function saveSyncState(db: SQLiteDatabase, patch: Partial<SyncState>) {
  const map: Record<keyof SyncState, string> = {
    role: 'sync.role',
    deviceName: 'sync.deviceName',
    myFileId: 'sync.myFileId',
    folderId: 'sync.folderId',
    peers: 'sync.peers',
    lastHash: 'sync.lastHash',
    lastSyncAt: 'sync.lastSyncAt',
    lastError: 'sync.lastError',
  };
  for (const [k, v] of Object.entries(patch) as [keyof SyncState, unknown][]) {
    const value = v === null || v === undefined ? '' : k === 'peers' ? JSON.stringify(v) : String(v);
    await setSetting(db, map[k], value);
  }
}
