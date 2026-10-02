import { router, Tabs, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { labColors, Sparkline } from '@/components/LabChart';
import { VITAL_STATUS_TEXT } from '@/components/VitalStatus';
import { Button, colors, EmptyState, Icon, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { useQuery } from '@/lib/useQuery';
import { formatVital, latestByType, VITALS, vitalStatus, whenText } from '@/lib/vitalsAnalysis';
import { listVitals } from '@/lib/vitals';

export default function VitalsTab() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const db = useSQLiteContext();
  const loadMembers = useCallback(() => listMembers(db), [db]);
  const { data: members } = useQuery(loadMembers);
  const memberId = members?.find((m) => m.id === params.memberId)?.id ?? members?.[0]?.id ?? null;
  const loadVitals = useCallback(() => (memberId ? listVitals(db, memberId) : Promise.resolve([])), [db, memberId]);
  const { data: vitals } = useQuery(loadVitals);

  const add = () => memberId && router.push({ pathname: '/vitals/add', params: { memberId } });
  const header = (
    <Tabs.Screen
      options={{
        headerRight: () =>
          memberId ? (
            <Pressable accessibilityLabel="Log a reading" hitSlop={8} style={{ marginRight: 16 }} onPress={add}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          ) : null,
      }}
    />
  );
  if (!members || !vitals) return header;
  if (!memberId) {
    return (
      <>
        {header}
        <EmptyState icon="pulse-outline" title="No family members yet" message="Add a family member to log blood pressure, sugar and more." />
      </>
    );
  }

  const latest = latestByType(vitals);

  return (
    <>
      {header}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {members.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {members.map((m) => {
              const on = m.id === memberId;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => router.setParams({ memberId: m.id })}
                  style={[styles.chip, on && { backgroundColor: m.color, borderColor: m.color }]}>
                  <Text style={[styles.chipText, on && styles.chipTextSelected]}>{m.name.split(' ')[0]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {VITALS.map((def) => {
            const v = latest.get(def.type);
            const status = v ? vitalStatus(v) : 'none';
            const history = vitals.filter((x) => x.type === def.type).slice(-12);
            return (
              <Pressable
                key={def.type}
                accessibilityRole="button"
                accessibilityLabel={`${def.label}${v ? `, latest ${formatVital(v)} ${def.unit}` : ', no readings'}`}
                onPress={() => router.push({ pathname: '/vitals/[type]', params: { type: def.type, memberId } })}
                style={({ pressed }) => [styles.card, { width: '48%', flexGrow: 1, gap: 4 }, pressed && styles.pressed]}>
                <View style={[styles.row, { gap: 6 }]}>
                  <Icon name={def.icon} color={def.color} size={18} />
                  <Text style={[styles.label, { flex: 1 }]} numberOfLines={1}>
                    {def.label}
                  </Text>
                </View>
                {v ? (
                  <>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: status === 'above' || status === 'below' ? labColors.out : colors.text }}>
                      {formatVital(v)} <Text style={{ fontSize: 13, fontWeight: '500', color: colors.muted }}>{def.unit}</Text>
                    </Text>
                    <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]} numberOfLines={1}>
                      {whenText(v.measuredAt)}
                    </Text>
                    {VITAL_STATUS_TEXT[status].text ? (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: VITAL_STATUS_TEXT[status].color }}>{VITAL_STATUS_TEXT[status].text}</Text>
                    ) : null}
                    <Sparkline values={history.map((x) => x.value)} color={def.color} width={120} />
                  </>
                ) : (
                  <Text style={[styles.subtitle, { marginTop: 4 }]}>No readings yet</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Button title="Log a reading" icon="add-outline" onPress={add} />
        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          Typical ranges are general adult guides, not targets. Your doctor may set different ones for you.
        </Text>
      </ScrollView>
    </>
  );
}
