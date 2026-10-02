import { fromBase64, toBase64, utf8 } from './crypto';

/**
 * The join code passed between family phones (as a QR code or as text on
 * WhatsApp). It carries the family key and where this phone's records live
 * on Drive, so whoever has it can read the family's records: share it only
 * with family.
 */
export type FamilyCode = {
  key: Uint8Array;
  /** Drive file id of the sharing phone's records, or null for a receive-only phone. */
  fileId: string | null;
  /** "Ravi's phone" */
  name: string;
};

const PREFIX = 'FHRJOIN1.';

const b64url = (b: Uint8Array) => toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export function encodeFamilyCode(code: FamilyCode) {
  const json = JSON.stringify({ k: b64url(code.key), f: code.fileId, n: code.name });
  return PREFIX + b64url(utf8.encode(json));
}

/** Accepts the code with surrounding text (a pasted WhatsApp message). Returns null when there's no valid code. */
export function decodeFamilyCode(text: string): FamilyCode | null {
  const m = /FHRJOIN1\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) return null;
  try {
    const data = JSON.parse(utf8.decode(fromB64url(m[1]))) as { k?: unknown; f?: unknown; n?: unknown };
    if (typeof data.k !== 'string' || (data.f !== null && typeof data.f !== 'string') || typeof data.n !== 'string') return null;
    const key = fromB64url(data.k);
    if (key.length !== 32) return null;
    if (data.f !== null && !/^[A-Za-z0-9_-]{10,100}$/.test(data.f)) return null;
    return { key, fileId: data.f, name: data.n.slice(0, 60) };
  } catch {
    return null;
  }
}

export function sameKey(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
