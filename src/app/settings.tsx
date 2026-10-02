import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setAppLock } from '@/components/AppLock';
import { setThemePref } from '@/components/theme';
import { Card, colors, Icon, SectionTitle, styles } from '@/components/ui';
import { getLockConfig, getThemePref, LOCK_DELAYS, saveLockConfig, saveThemePref, THEME_PREFS, type ThemePref } from '@/lib/settings';
import { useQuery } from '@/lib/useQuery';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(() => getLockConfig(db), [db]);
  const { data: lock, refresh } = useQuery(load);
  const loadTheme = useCallback(() => getThemePref(db), [db]);
  const { data: theme, refresh: refreshTheme } = useQuery(loadTheme);
  const [busy, setBusy] = useState(false);

  if (!lock || !theme) return null;

  async function chooseTheme(pref: ThemePref) {
    await saveThemePref(db, pref);
    setThemePref(pref);
    refreshTheme();
  }

  async function toggle(enabled: boolean) {
    if (!lock || busy) return;
    setBusy(true);
    const problem = await setAppLock(db, enabled, lock.after);
    setBusy(false);
    if (problem) Alert.alert('App lock', problem);
    refresh();
  }

  async function setDelay(after: number) {
    if (!lock) return;
    await saveLockConfig(db, { ...lock, after });
    refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <SectionTitle>Privacy</SectionTitle>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Icon name="lock-closed-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>App lock</Text>
            <Text style={styles.subtitle}>Ask for fingerprint, face or the phone’s PIN to open the app.</Text>
          </View>
          <Switch
            value={lock.enabled}
            disabled={busy}
            onValueChange={toggle}
            accessibilityLabel="App lock"
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {lock.enabled ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Lock again when away</Text>
            <View style={styles.chips}>
              {LOCK_DELAYS.map((d) => {
                const on = d.seconds === lock.after;
                return (
                  <Pressable
                    key={d.seconds}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setDelay(d.seconds)}
                    style={[styles.chip, on && styles.chipSelected]}>
                    <Text style={[styles.chipText, on && styles.chipTextSelected]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Icon name="contrast-outline" color={colors.primary} />
          <Text style={[styles.title, { flex: 1 }]}>Theme</Text>
        </View>
        <View style={styles.chips}>
          {THEME_PREFS.map((t) => {
            const on = t.value === theme;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => chooseTheme(t.value)}
                style={[styles.chip, on && styles.chipSelected]}>
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card onPress={() => router.push('/share')}>
        <View style={styles.row}>
          <Icon name="share-social-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Share & sync with family</Text>
            <Text style={styles.subtitle}>Send or import the family data file; it’s also a backup.</Text>
          </View>
          <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
        </View>
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card>
        <Text style={styles.title}>Family Health Registry</Text>
        <Text style={styles.subtitle}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text style={[styles.subtitle, { lineHeight: 19 }]}>
          Your records stay on this phone. Nothing is uploaded unless you share it.
        </Text>
      </Card>
    </ScrollView>
  );
}
