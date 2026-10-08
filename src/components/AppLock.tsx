import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Button, colors, Icon } from './ui';
import { getLockConfig, onLockConfigChange, saveLockConfig, type LockConfig } from '@/lib/settings';
import { t } from '@/i18n';

/** Asks for fingerprint, face or the phone's PIN. Never throws. */
export async function verifyOwner(promptMessage: string) {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success ? null : result.error;
  } catch {
    return 'unknown';
  }
}

/** True when the phone has any screen lock (PIN, pattern, password, fingerprint or face). */
export async function phoneHasScreenLock() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/**
 * Covers the whole app until the owner unlocks it, when app lock is on. It also
 * hides the screen while the app is in the background (the app switcher preview)
 * and locks again after the chosen time away.
 */
export function AppLock() {
  const db = useSQLiteContext();
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(true);
  const [covered, setCovered] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const leftAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    // If the phone's own screen lock was removed, the app cannot verify anyone;
    // keep the records reachable rather than locking the owner out.
    if (!(await phoneHasScreenLock())) {
      setLocked(false);
      setMessage(null);
      return;
    }
    authenticating.current = true;
    const error = await verifyOwner('Unlock Family Health Registry');
    authenticating.current = false;
    if (!error) {
      setLocked(false);
      setCovered(false);
      setMessage(null);
    } else if (error === 'lockout') {
      setMessage('Too many attempts. Unlock your phone with its PIN, then try again.');
    } else if (error !== 'user_cancel' && error !== 'system_cancel' && error !== 'app_cancel') {
      setMessage('Could not verify. Try again.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getLockConfig(db)
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        if (c.enabled) unlock();
        else setLocked(false);
      })
      .catch(() => alive && setLocked(false));
    const off = onLockConfigChange((c) => {
      setConfig(c);
      if (!c.enabled) setLocked(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [db, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!config?.enabled || authenticating.current) return;
      if (state === 'inactive' || state === 'background') {
        setCovered(true);
        if (state === 'background' && leftAt.current === null) leftAt.current = Date.now();
        return;
      }
      if (state === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
        leftAt.current = null;
        if (away >= config.after * 1000) {
          setLocked(true);
          unlock();
        } else {
          setCovered(false);
        }
      }
    });
    return () => sub.remove();
  }, [config, unlock]);

  if (config === null) return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />;
  if (!config.enabled || (!locked && !covered)) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Icon name="lock-closed" size={36} color="#FFFFFF" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{t('Family Health Registry')}</Text>
      {locked ? (
        <>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{t('Locked to keep your family’s health records private.')}</Text>
          {message ? <Text style={[styles.message, { color: colors.danger }]}>{message}</Text> : null}
          <Button title={t('Unlock')} icon="finger-print" onPress={unlock} style={{ alignSelf: 'stretch', marginTop: 24 }} />
        </>
      ) : null}
    </View>
  );
}

/** Turns app lock on or off after confirming it is really the owner. Returns a message to show, or null. */
export async function setAppLock(db: Parameters<typeof saveLockConfig>[0], enabled: boolean, after: number) {
  if (enabled && !(await phoneHasScreenLock())) {
    return 'Set up a screen lock on your phone first (PIN, pattern, fingerprint or face). The app uses it to unlock.';
  }
  const error = await verifyOwner(enabled ? 'Confirm to turn on app lock' : 'Confirm to turn off app lock');
  if (error) return error === 'user_cancel' || error === 'system_cancel' ? null : 'Could not verify. App lock was not changed.';
  await saveLockConfig(db, { enabled, after });
  return null;
}

// Colours are applied inline so they follow the light/dark theme.
const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 1000,
    elevation: 1000,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 6 },
  message: { fontSize: 14, textAlign: 'center', marginTop: 12 },
});
