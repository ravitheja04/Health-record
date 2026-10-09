import type { RegistryBundle } from '../share';

/**
 * What each phone keeps (encrypted) in the family storage: all the records
 * on that phone, without the photos and PDFs, which are stored once each as
 * "file-<attachment id>.enc".
 */
export type Snapshot = {
  format: 'fhr-sync';
  version: 2;
  deviceName: string;
  updatedAt: string;
  bundle: RegistryBundle;
};

export function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Snapshot;
  return !!s && s.format === 'fhr-sync' && s.version === 2 && typeof s.deviceName === 'string' && !!s.bundle;
}

export const phoneFile = (deviceId: string) => `phone-${deviceId}.enc`;
export const attachmentFile = (attachmentId: string) => `file-${attachmentId}.enc`;
export const isPhoneFile = (name: string) => /^phone-[A-Za-z0-9_-]{6,64}\.enc$/.test(name);

/**
 * The part of the snapshot that decides whether to upload again: everything
 * except the timestamps, so an unchanged phone doesn't re-upload.
 */
export function snapshotFingerprintText(s: Omit<Snapshot, 'updatedAt'>) {
  const b = s.bundle;
  return JSON.stringify([s.deviceName, b.members, b.records, b.attachments, b.labResults, b.medications, b.doseLogs, b.vaccinations, b.emergencyInfo, b.vitals]);
}
