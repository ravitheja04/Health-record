import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setAppLock } from '@/components/AppLock';
import { setThemePref } from '@/components/theme';
import { Card, colors, Icon, SectionTitle, styles } from '@/components/ui';
import { getLangPref, getLockConfig, getThemePref, saveLangPref, LOCK_DELAYS, saveLockConfig, saveThemePref, THEME_PREFS, type ThemePref } from '@/lib/settings';
import { useQuery } from '@/lib/useQuery';
import { refreshMedicinesWidget } from '@/widget/refresh';
import { LANG_PREFS, resolveLang, setLang, t, type LangPref } from '@/i18n';
import { deviceLanguage } from '@/i18n/device';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(() => getLockConfig(db), [db]);
  const { data: lock, refresh } = useQuery(load);
  const loadTheme = useCallback(() => getThemePref(db), [db]);
  const { data: theme, refresh: refreshTheme } = useQuery(loadTheme);
  const loadLang = useCallback(() => getLangPref(db), [db]);
  const { data: langPref, refresh: refreshLang } = useQuery(loadLang);
  const [busy, setBusy] = useState(false);

  if (!lock || !theme || !langPref) return null;

  async function chooseLang(pref: LangPref) {
    await saveLangPref(db, pref);
    setLang(resolveLang(pref, deviceLanguage()));
    refreshLang();
  }

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
    refreshMedicinesWidget(db); // hides or shows medicine names on the home screen
    if (problem) Alert.alert(t('App lock'), problem);
    refresh();
  }

  async function setDelay(after: number) {
    if (!lock) return;
    await saveLockConfig(db, { ...lock, after });
    refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <SectionTitle>{t('Privacy')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Icon name="lock-closed-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('App lock')}</Text>
            <Text style={styles.subtitle}>{t('Ask for fingerprint, face or the phone’s PIN to open the app.')}</Text>
          </View>
          <Switch
            value={lock.enabled}
            disabled={busy}
            onValueChange={toggle}
            accessibilityLabel={t('App lock')}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {lock.enabled ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{t('Lock again when away')}</Text>
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

      <SectionTitle>{t('Language')}</SectionTitle>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Icon name="language-outline" color={colors.primary} />
          <Text style={[styles.title, { flex: 1 }]}>{t('App language')}</Text>
        </View>
        <View style={styles.chips}>
          {LANG_PREFS.map((option) => {
            const on = option.value === langPref;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => chooseLang(option.value)}
                style={[styles.chip, on && styles.chipSelected]}>
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{option.value === 'system' ? t(option.label) : option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('Test names, units and medicine names stay in English, as on lab reports. The emergency card stays in English for doctors.')}</Text>
      </Card>

      <SectionTitle>{t('Appearance')}</SectionTitle>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Icon name="contrast-outline" color={colors.primary} />
          <Text style={[styles.title, { flex: 1 }]}>{t('Theme')}</Text>
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

      <SectionTitle>{t('Data')}</SectionTitle>
      <Card onPress={() => router.push('/sync')}>
        <View style={styles.row}>
          <Icon name="sync-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('Family sync (Google Drive)')}</Text>
            <Text style={styles.subtitle}>{t('Keep the family’s phones in step automatically, encrypted.')}</Text>
          </View>
          <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
        </View>
      </Card>
      <Card onPress={() => router.push('/share')}>
        <View style={styles.row}>
          <Icon name="share-social-outline" color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('Share & sync with family')}</Text>
            <Text style={styles.subtitle}>{t('Send or import the family data file; it’s also a backup.')}</Text>
          </View>
          <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
        </View>
      </Card>

      <SectionTitle>{t('About')}</SectionTitle>
      <Card>
        <Text style={styles.title}>{t('Family Health Registry')}</Text>
        <Text style={styles.subtitle}>{t('Version')}{' '}{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text style={[styles.subtitle, { lineHeight: 19 }]}>
          {t('Your records stay on this phone. Nothing is uploaded unless you share it.')}
        </Text>
      </Card>
    </ScrollView>
  );
}
