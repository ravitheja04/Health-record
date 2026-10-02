import type { SQLiteDatabase } from 'expo-sqlite';

/** Settings that belong to this phone only; never shared in family data files. */
export async function getSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

export type LockConfig = { enabled: boolean; /** Seconds in the background before the app locks again. */ after: number };

export const LOCK_DELAYS = [
  { seconds: 60, label: 'After 1 minute' },
  { seconds: 300, label: 'After 5 minutes' },
  { seconds: 900, label: 'After 15 minutes' },
];

export async function getLockConfig(db: SQLiteDatabase): Promise<LockConfig> {
  const [enabled, after] = await Promise.all([getSetting(db, 'lock.enabled'), getSetting(db, 'lock.after')]);
  return { enabled: enabled === '1', after: after ? Number(after) || 60 : 60 };
}

export async function saveLockConfig(db: SQLiteDatabase, config: LockConfig) {
  await setSetting(db, 'lock.enabled', config.enabled ? '1' : '0');
  await setSetting(db, 'lock.after', String(config.after));
  lockListeners.forEach((l) => l(config));
}

type Listener = (config: LockConfig) => void;
const lockListeners = new Set<Listener>();

/** Lets the lock screen react immediately when the setting changes. */
export function onLockConfigChange(listener: Listener) {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_PREFS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Same as phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export async function getThemePref(db: SQLiteDatabase): Promise<ThemePref> {
  const v = await getSetting(db, 'theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

export async function saveThemePref(db: SQLiteDatabase, pref: ThemePref) {
  await setSetting(db, 'theme', pref);
}
