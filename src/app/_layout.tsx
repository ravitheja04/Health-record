import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { AppLock } from '@/components/AppLock';
import { getScheme, setThemePref, subscribeTheme } from '@/components/theme';
import { colors } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { configureNotifications, syncRemindersQuietly } from '@/lib/reminders';
import { getThemePref } from '@/lib/settings';
import { syncQuietly } from '@/lib/sync';

configureNotifications();

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

/** Applies the light/dark choice saved in Settings once the database is open. */
function SavedTheme() {
  const db = useSQLiteContext();
  useEffect(() => {
    getThemePref(db)
      .then(setThemePref)
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
          {/* Keyed by theme so every screen redraws with the new colours. */}
          <Stack
            key={scheme}
            screenOptions={{
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.text },
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
            <Stack.Screen name="share" options={{ title: 'Share & Sync', presentation: 'modal' }} />
          <Stack.Screen name="sync/index" options={{ title: 'Family sync' }} />
          <Stack.Screen name="sync/scan" options={{ title: 'Scan family code' }} />
            <Stack.Screen name="member/[id]" options={{ title: '' }} />
            <Stack.Screen name="member/edit" options={{ title: 'Family member', presentation: 'modal' }} />
            <Stack.Screen name="record/[id]" options={{ title: 'Record' }} />
            <Stack.Screen name="record/edit" options={{ title: 'Medical record', presentation: 'modal' }} />
            <Stack.Screen name="record/results" options={{ title: 'Test results', presentation: 'modal' }} />
            <Stack.Screen name="record/import" options={{ title: 'Read lab report', presentation: 'modal' }} />
            <Stack.Screen name="labs/[memberId]" options={{ title: 'Lab trends' }} />
            <Stack.Screen name="labs/test" options={{ title: '' }} />
            <Stack.Screen name="labs/compare" options={{ title: 'Compare reports' }} />
            <Stack.Screen name="medicines/edit" options={{ title: 'Medicine', presentation: 'modal' }} />
            <Stack.Screen name="vaccines/[memberId]" options={{ title: 'Vaccinations' }} />
            <Stack.Screen name="vaccines/edit" options={{ title: 'Vaccination', presentation: 'modal' }} />
            <Stack.Screen name="vaccines/schedule" options={{ title: 'Vaccination schedule', presentation: 'modal' }} />
            <Stack.Screen name="emergency/[memberId]" options={{ title: 'Emergency card' }} />
            <Stack.Screen name="emergency/edit" options={{ title: 'Emergency card', presentation: 'modal' }} />
            <Stack.Screen name="vitals/[type]" options={{ title: 'Vitals' }} />
            <Stack.Screen name="growth/[memberId]" options={{ title: 'Growth' }} />
            <Stack.Screen name="vitals/add" options={{ title: 'Log a reading', presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
          <AppLock />
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
