import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Attachment } from './types';
import { t } from '../i18n';

/** A file the user picked that has not been saved into the registry yet. */
export type PendingFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

function attachmentsDir() {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function attachmentFile(a: Pick<Attachment, 'fileName'>) {
  return new File(attachmentsDir(), a.fileName);
}

function extensionFor(name: string, mimeType: string) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  if (match) return match[1].toLowerCase();
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType.startsWith('image/')) return 'jpg';
  return 'bin';
}

/** Copies a picked file into permanent app storage and returns its metadata. */
export async function persistPendingFile(recordId: string, pending: PendingFile): Promise<Attachment> {
  const id = randomUUID();
  const fileName = `${id}.${extensionFor(pending.name, pending.mimeType)}`;
  const dest = new File(attachmentsDir(), fileName);
  await new File(pending.uri).copy(dest);
  return {
    id,
    recordId,
    name: pending.name,
    mimeType: pending.mimeType,
    fileName,
    size: dest.size ?? pending.size,
    createdAt: new Date().toISOString(),
  };
}

/** Writes base64 content (from an imported bundle) into app storage. */
export function writeAttachmentFromBase64(a: Attachment, base64: string) {
  const file = new File(attachmentsDir(), a.fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
}

export function readAttachmentBase64(a: Attachment): string | null {
  const file = attachmentFile(a);
  return file.exists ? file.base64Sync() : null;
}

export function removeAttachmentFiles(list: Pick<Attachment, 'fileName'>[]) {
  for (const a of list) {
    try {
      const file = attachmentFile(a);
      if (file.exists) file.delete();
    } catch {
      // A missing file must not block deleting its database row.
    }
  }
}

export async function shareFile(uri: string, mimeType: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(t('Sharing is not available on this device.'));
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: utiFor(mimeType) });
}

function utiFor(mimeType: string) {
  if (mimeType === 'application/pdf') return 'com.adobe.pdf';
  if (mimeType === 'application/json') return 'public.json';
  if (mimeType.startsWith('image/')) return 'public.image';
  return 'public.data';
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
