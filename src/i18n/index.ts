import te from './te';

/**
 * App text in English or Telugu. Text is written in English in the code and
 * passed through `t()`; the Telugu dictionary (te.ts) maps each English
 * string to its translation, and anything missing stays in English.
 *
 * Medical test names, units, vaccine and medicine names stay in English, as
 * on Indian lab reports, and so do the emergency card and PDFs for doctors.
 */

export type Lang = 'en' | 'te';
export type LangPref = 'system' | Lang;

export const LANG_PREFS: { value: LangPref; label: string }[] = [
  { value: 'system', label: 'Same as phone' },
  { value: 'en', label: 'English' },
  { value: 'te', label: 'తెలుగు' },
];

const dictionaries: Record<Exclude<Lang, 'en'>, Record<string, string>> = { te };

let lang: Lang = 'en';
const listeners = new Set<() => void>();

/** `t('{count} results found', { count: 3 })` */
export function t(text: string, params?: Record<string, string | number>) {
  const s = lang === 'en' ? text : (dictionaries[lang][text] ?? text);
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/** Picks the singular or plural form: tn(n, '{n} test', '{n} tests'). Telugu entries carry their own forms. */
export function tn(n: number, one: string, many: string) {
  return t(n === 1 ? one : many, { n });
}

export function getLang() {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  listeners.forEach((l) => l());
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resolveLang(pref: LangPref, deviceLanguage: string | null | undefined): Lang {
  if (pref !== 'system') return pref;
  return deviceLanguage === 'te' ? 'te' : 'en';
}
