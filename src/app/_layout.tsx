import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useNavigationContainerRef, type Href } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { AppLock } from '@/components/AppLock';
import { getScheme, setThemePref, subscribeTheme } from '@/components/theme';
import { colors } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { configureNotifications, syncRemindersQuietly } from '@/lib/reminders';
import { getLangPref, getThemePref } from '@/lib/settings';
import { syncQuietly } from '@/lib/sync';
import { getLang, resolveLang, setLang, subscribeLang, t } from '@/i18n';
import { deviceLanguage } from '@/i18n/device';

configureNotifications();

// The phone's language until the saved choice is read.
setLang(resolveLang('system', deviceLanguage()));

/** Refreshes reminders when the app opens and opens the right screen when one is tapped. */
function Reminders() {
  const db = useSQLiteContext();
  useEffect(() => {
    syncRemindersQuietly(db);
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as Href);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      // Let the navigator mount before navigating from a cold start.
      setTimeout(() => open(last), 0);
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [db]);
  return null;
}

type NavState = { index?: number; routes: { name: string; params?: object; state?: NavState }[] };

/** The same screens and nesting without route keys, so a reset creates fresh screen instances. */
function withoutKeys(state: NavState): NavState {
  return {
    index: state.index,
    routes: state.routes.map((r) => ({ name: r.name, params: r.params, ...(r.state ? { state: withoutKeys(r.state) } : {}) })),
  };
}

/** Family sync: fetch the family's changes and send this phone's when the app opens or comes back. */
function SyncOnOpen() {
  const db = useSQLiteContext();
  useEffect(() => {
    syncQuietly(db);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncQuietly(db);
    });
    return () => sub.remove();
  }, [db]);
  return null;
}

/** Applies the light/dark and language choices saved in Settings once the database is open. */
function SavedTheme() {
  const db = useSQLiteContext();
  useEffect(() => {
    getThemePref(db)
      .then(setThemePref)
      .catch(() => {});
    getLangPref(db)
      .then((pref) => setLang(resolveLang(pref, deviceLanguage())))
      .catch(() => {});
  }, [db]);
  return null;
}

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  const scheme = useSyncExternalStore(subscribeTheme, getScheme);
  const lang = useSyncExternalStore(subscribeLang, getLang);
  const navigation = useNavigationContainerRef();
  const look = `${scheme}-${lang}`;
  const shownLook = useRef(look);
  useEffect(() => {
    if (shownLook.current === look) return;
    shownLook.current = look;
    // Screens and their headers keep the colours and text they were drawn with, so
    // rebuild the open screens (same places, fresh instances) after a theme or language change.
    const state = navigation.isReady() ? navigation.getRootState() : undefined;
    if (state) navigation.reset(withoutKeys(state as NavState) as Parameters<typeof navigation.reset>[0]);
  }, [look, navigation]);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.primary, background: colors.bg, card: colors.card, text: colors.text, border: colors.border },
  };
  return (
    <ThemeProvider value={navTheme}>
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <SavedTheme />
          <Reminders />
        <SyncOnOpen />
            <Stack
              screenOptions={{
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.text },
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Home') }} />
            <Stack.Screen name="share" options={{ title: t('Share & Sync'), presentation: 'modal' }} />
          <Stack.Screen name="sync/index" options={{ title: t('Family sync') }} />
          <Stack.Screen name="sync/scan" options={{ title: t('Scan family code') }} />
            <Stack.Screen name="member/[id]" options={{ title: '' }} />
            <Stack.Screen name="member/edit" options={{ title: t('Family member'), presentation: 'modal' }} />
            <Stack.Screen name="record/[id]" options={{ title: t('Record') }} />
            <Stack.Screen name="record/edit" options={{ title: t('Medical record'), presentation: 'modal' }} />
            <Stack.Screen name="record/results" options={{ title: t('Test results'), presentation: 'modal' }} />
            <Stack.Screen name="record/import" options={{ title: t('Read lab report'), presentation: 'modal' }} />
            <Stack.Screen name="labs/[memberId]" options={{ title: t('Lab trends') }} />
            <Stack.Screen name="labs/test" options={{ title: '' }} />
            <Stack.Screen name="labs/compare" options={{ title: t('Compare reports') }} />
            <Stack.Screen name="labs/report" options={{ title: t('Smart report') }} />
            <Stack.Screen name="medicines/edit" options={{ title: t('Medicine'), presentation: 'modal' }} />
            <Stack.Screen name="vaccines/[memberId]" options={{ title: t('Vaccinations') }} />
            <Stack.Screen name="vaccines/edit" options={{ title: t('Vaccination'), presentation: 'modal' }} />
            <Stack.Screen name="vaccines/schedule" options={{ title: t('Vaccination schedule'), presentation: 'modal' }} />
            <Stack.Screen name="emergency/[memberId]" options={{ title: t('Emergency card') }} />
            <Stack.Screen name="emergency/edit" options={{ title: t('Emergency card'), presentation: 'modal' }} />
            <Stack.Screen name="vitals/[type]" options={{ title: t('Vitals') }} />
            <Stack.Screen name="growth/[memberId]" options={{ title: t('Growth') }} />
            <Stack.Screen name="vitals/add" options={{ title: t('Log a reading'), presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ title: t('Settings') }} />
          </Stack>
          <AppLock />
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
