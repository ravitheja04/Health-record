import type { RegistryBundle } from '../share';

/** One family phone whose records this phone reads. */
export type Peer = {
  fileId: string;
  name: string;
  /** Drive modifiedTime of the last version merged, so unchanged files are skipped. */
  lastModified: string | null;
  lastError?: string | null;
};

/** What each phone uploads (encrypted) to its own Drive. */
export type Snapshot = {
  format: 'fhr-sync';
  version: 1;
  deviceName: string;
  updatedAt: string;
  /** Family phones this phone knows, so others find them without scanning everyone's code. */
  directory: { fileId: string; name: string }[];
  /** Attachment id → Drive file holding it (encrypted). */
  files: Record<string, string>;
  /** Records without attachment contents. */
  bundle: RegistryBundle;
};

export function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Snapshot;
  return (
    !!s &&
    s.format === 'fhr-sync' &&
    s.version === 1 &&
    typeof s.deviceName === 'string' &&
    Array.isArray(s.directory) &&
    !!s.files &&
    typeof s.files === 'object' &&
    !!s.bundle
  );
}

const VALID_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** Adds phones listed in a family member's directory that this phone doesn't know yet. */
export function mergeDirectory(peers: Peer[], directory: Snapshot['directory'], myFileId: string | null): Peer[] {
  const next = [...peers];
  for (const d of directory) {
    if (!d || typeof d.fileId !== 'string' || !VALID_ID.test(d.fileId)) continue;
    if (d.fileId === myFileId || next.some((p) => p.fileId === d.fileId)) continue;
    next.push({ fileId: d.fileId, name: typeof d.name === 'string' ? d.name.slice(0, 60) : 'Family phone', lastModified: null });
  }
  return next;
}

/**
 * The part of the snapshot that decides whether to upload again: everything
 * except the timestamp, so an unchanged phone doesn't re-upload.
 */
export function snapshotFingerprintText(s: Omit<Snapshot, 'updatedAt'>) {
  return JSON.stringify([s.deviceName, s.directory, s.files, s.bundle.members, s.bundle.records, s.bundle.attachments, s.bundle.labResults, s.bundle.medications, s.bundle.doseLogs, s.bundle.vaccinations, s.bundle.emergencyInfo, s.bundle.vitals]);
}
