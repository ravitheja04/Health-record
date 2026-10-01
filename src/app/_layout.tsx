import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="index" options={{ title: 'Family Health' }} />
          <Stack.Screen name="search" options={{ title: 'Search records' }} />
          <Stack.Screen name="share" options={{ title: 'Share & Sync', presentation: 'modal' }} />
          <Stack.Screen name="member/[id]" options={{ title: '' }} />
          <Stack.Screen name="member/edit" options={{ title: 'Family member', presentation: 'modal' }} />
          <Stack.Screen name="record/[id]" options={{ title: 'Record' }} />
          <Stack.Screen name="record/edit" options={{ title: 'Medical record', presentation: 'modal' }} />
          <Stack.Screen name="record/results" options={{ title: 'Test results', presentation: 'modal' }} />
          <Stack.Screen name="labs/[memberId]" options={{ title: 'Lab trends' }} />
          <Stack.Screen name="labs/test" options={{ title: '' }} />
          <Stack.Screen name="labs/compare" options={{ title: 'Compare reports' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
