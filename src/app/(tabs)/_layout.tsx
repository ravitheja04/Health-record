import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { EMERGENCY_RED } from '@/components/EmergencyCard';
import { colors, Icon } from '@/components/ui';
import { t } from '@/i18n';

function tabIcon(name: string, activeName: string) {
  // The filled icon marks the selected tab, so it doesn't rely on colour alone.
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Icon name={focused ? activeName : name} color={color as string} size={size} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: t('Home'), headerTitle: t('Family Health'), tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="records" options={{ title: t('Records'), tabBarIcon: tabIcon('folder-open-outline', 'folder-open') }} />
      <Tabs.Screen name="medicines" options={{ title: t('Medicines'), tabBarIcon: tabIcon('medkit-outline', 'medkit') }} />
      <Tabs.Screen name="vitals" options={{ title: t('Vitals'), tabBarIcon: tabIcon('pulse-outline', 'pulse') }} />
      <Tabs.Screen
        name="emergency"
        options={{ title: t('Emergency'), tabBarActiveTintColor: EMERGENCY_RED, tabBarIcon: tabIcon('medical-outline', 'medical') }}
      />
    </Tabs>
  );
}
