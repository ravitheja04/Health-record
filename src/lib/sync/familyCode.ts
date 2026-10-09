import { cleanStoreUrl } from './store';
import { fromBase64, toBase64, utf8 } from './crypto';

/**
 * The join code passed between family phones (as a QR code or as text on
 * WhatsApp). It carries the family key and the family storage link, so
 * whoever has it can read and add to the family's records: share it only
 * with family.
 */
export type FamilyCode = {
  key: Uint8Array;
  /** The family storage's web app link. */
  url: string;
  /** Who shared it, e.g. "Ravi's phone". */
  name: string;
};

const PREFIX = 'FHRJOIN2.';

const b64url = (b: Uint8Array) => toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export function encodeFamilyCode(code: FamilyCode) {
  const json = JSON.stringify({ k: b64url(code.key), u: code.url, n: code.name });
  return PREFIX + b64url(utf8.encode(json));
}

/** Accepts the code with surrounding text (a pasted WhatsApp message). Returns null when there's no valid code. */
export function decodeFamilyCode(text: string): FamilyCode | null {
  const m = /FHRJOIN2\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) return null;
  try {
    const data = JSON.parse(utf8.decode(fromB64url(m[1]))) as { k?: unknown; u?: unknown; n?: unknown };
    if (typeof data.k !== 'string' || typeof data.u !== 'string' || typeof data.n !== 'string') return null;
    const key = fromB64url(data.k);
    const url = cleanStoreUrl(data.u);
    if (key.length !== 32 || !url) return null;
    return { key, url, name: data.n.slice(0, 60) };
  } catch {
    return null;
  }
}

export function sameKey(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
