import type { SQLiteDatabase } from 'expo-sqlite';

import { readAttachmentBase64 } from '../files';
import { addSyncedAttachment, buildRegistryBundle, mergeRegistryBundle, validateBundle } from '../share';
import { decrypt, encrypt, fromBase64, toBase64, utf8, WrongKeyError } from './crypto';
import { DriveError, type DriveClient } from './drive';
import { isSnapshot, mergeDirectory, snapshotFingerprintText, type Peer, type Snapshot } from './snapshot';
import { getSyncState, saveSyncState } from './state';
import { t } from '../../i18n';

export type SyncDeps = {
  db: SQLiteDatabase;
  drive: DriveClient;
  key: Uint8Array;
  random: (n: number) => Uint8Array;
  sha256: (text: string) => Promise<string>;
  /** Signed in with Google, so this phone can upload its own records. */
  canUpload: boolean;
};

export type SyncReport = {
  received: { name: string; changed: boolean }[];
  uploaded: boolean;
  filesUploaded: number;
  filesReceived: number;
  problems: string[];
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One round of family sync: read every family phone's latest records (and
 * any new photos/PDFs) and merge them, then upload this phone's records if
 * they changed.
 */
export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const { db, drive, key } = deps;
  const state = await getSyncState(db);
  const report: SyncReport = { received: [], uploaded: false, filesUploaded: 0, filesReceived: 0, problems: [] };
  let peers = state.peers;

  // ---- Receive ----------------------------------------------------------------
  for (let i = 0; i < peers.length; i++) {
    const peer = peers[i];
    if (peer.fileId === state.myFileId) continue;
    try {
      const modified = await drive.publicModifiedTime(peer.fileId);
      if (modified === null) {
        peers[i] = { ...peer, lastError: t('Not found on Drive. That phone may have left the family.') };
        continue;
      }
      if (modified === peer.lastModified && !peer.lastError) {
        report.received.push({ name: peer.name, changed: false });
        continue;
      }
      const snapshot: unknown = JSON.parse(utf8.decode(decrypt(key, await drive.publicDownload(peer.fileId))));
      if (!isSnapshot(snapshot)) throw new Error(t('Not a family sync file.'));
      const { missingFiles } = await mergeRegistryBundle(db, validateBundle(snapshot.bundle));
      for (const a of missingFiles) {
        const driveFileId = snapshot.files[a.id];
        if (!driveFileId) continue;
        try {
          const bytes = decrypt(key, await drive.publicDownload(driveFileId));
          if (await addSyncedAttachment(db, a, toBase64(bytes))) report.filesReceived++;
          await db.runAsync('INSERT OR REPLACE INTO sync_files (attachmentId, driveFileId) VALUES (?, ?)', a.id, driveFileId);
        } catch (e) {
          report.problems.push(`${t('A file from {name}', { name: snapshot.deviceName })}: ${message(e)}`);
        }
      }
      peers[i] = { fileId: peer.fileId, name: snapshot.deviceName || peer.name, lastModified: modified, lastError: null };
      peers = mergeDirectory(peers, snapshot.directory, state.myFileId);
      report.received.push({ name: peers[i].name, changed: true });
    } catch (e) {
      const text = e instanceof WrongKeyError ? t('Uses a different family code. Ask them to join with yours.') : message(e);
      peers[i] = { ...peer, lastError: text };
      report.problems.push(`${peer.name}: ${text}`);
    }
  }
  await saveSyncState(db, { peers });

  // ---- Send -------------------------------------------------------------------
  if (deps.canUpload) {
    try {
      await upload(deps, state.myFileId, state.folderId, state.lastHash, state.deviceName, peers, report);
    } catch (e) {
      report.problems.push(e instanceof DriveError && e.status === 401 ? e.message : `${t('Uploading')}: ${message(e)}`);
    }
  }

  await saveSyncState(db, { lastSyncAt: new Date().toISOString(), lastError: report.problems[0] ?? null });
  return report;
}

async function upload(
  deps: SyncDeps,
  knownFileId: string | null,
  knownFolderId: string | null,
  lastHash: string | null,
  deviceName: string,
  peers: Peer[],
  report: SyncReport
) {
  const { db, drive, key, random } = deps;
  const folderId = knownFolderId ?? (await drive.findOwn('folder')) ?? (await drive.createFolder('Family Health Registry (encrypted)', 'folder'));
  if (folderId !== knownFolderId) await saveSyncState(db, { folderId });

  const bundle = await buildRegistryBundle(db, undefined, false);

  // Photos and PDFs go up once each, as their own encrypted files.
  const mapping = new Map(
    (await db.getAllAsync<{ attachmentId: string; driveFileId: string }>('SELECT * FROM sync_files')).map((r) => [r.attachmentId, r.driveFileId])
  );
  for (const a of bundle.attachments) {
    if (mapping.has(a.id)) continue;
    const base64 = readAttachmentBase64(a);
    if (base64 === null) continue;
    const id = await drive.createFile(`file-${a.id}.enc`, encrypt(key, fromBase64(base64), random), { parent: folderId });
    await drive.shareByLink(id);
    await db.runAsync('INSERT OR REPLACE INTO sync_files (attachmentId, driveFileId) VALUES (?, ?)', a.id, id);
    mapping.set(a.id, id);
    report.filesUploaded++;
  }

  const myFileId = knownFileId ?? (await drive.findOwn('snapshot'));
  const body: Omit<Snapshot, 'updatedAt'> = {
    format: 'fhr-sync',
    version: 1,
    deviceName,
    directory: [...(myFileId ? [{ fileId: myFileId, name: deviceName }] : []), ...peers.map((p) => ({ fileId: p.fileId, name: p.name }))],
    files: Object.fromEntries(bundle.attachments.flatMap((a) => (mapping.has(a.id) ? [[a.id, mapping.get(a.id)!]] : []))),
    bundle,
  };
  const hash = await deps.sha256(snapshotFingerprintText(body));
  if (myFileId && hash === lastHash) return;

  const text = encrypt(key, utf8.encode(JSON.stringify({ ...body, updatedAt: new Date().toISOString() })), random);
  let fileId = myFileId;
  if (fileId) {
    await drive.updateFile(fileId, text);
  } else {
    fileId = await drive.createFile(`Family Health Registry - ${deviceName || 'phone'}.enc`, text, { parent: folderId, tag: 'snapshot' });
    await drive.shareByLink(fileId);
  }
  await saveSyncState(db, { myFileId: fileId, lastHash: hash });
  report.uploaded = true;
}
