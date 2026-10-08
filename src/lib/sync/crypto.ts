import { gcm } from '@noble/ciphers/aes.js';
import { t } from '../../i18n';

/**
 * End-to-end encryption for family sync. Every file put on Google Drive is
 * AES-256-GCM encrypted with the family key, which only exists on the
 * family's phones (passed around in the join code), never on Drive.
 */

const MAGIC = 'FHRSYNC1:';

export function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** UTF-8 without TextEncoder/TextDecoder, which not every JS engine on phones provides. */
export const utf8 = {
  encode(s: string) {
    const out: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  },
  decode(b: Uint8Array) {
    let s = '';
    for (let i = 0; i < b.length; ) {
      const c = b[i++];
      let cp = c;
      if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63);
      s += String.fromCodePoint(cp);
    }
    return s;
  },
};

/** `random` must return cryptographically secure bytes (expo-crypto on the phone). */
export function encrypt(key: Uint8Array, plaintext: Uint8Array, random: (n: number) => Uint8Array) {
  const nonce = random(12);
  const sealed = gcm(key, nonce).encrypt(plaintext);
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return MAGIC + toBase64(out);
}

export class WrongKeyError extends Error {}

export function decrypt(key: Uint8Array, text: string) {
  if (!text.startsWith(MAGIC)) throw new WrongKeyError(t('Not a family sync file.'));
  const raw = fromBase64(text.slice(MAGIC.length).trim());
  try {
    return gcm(key, raw.subarray(0, 12)).decrypt(raw.subarray(12));
  } catch {
    // GCM authentication fails for a different family's key or a damaged file.
    throw new WrongKeyError(t('This file was made by a different family or is damaged.'));
  }
}
