import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors, shortTimeLabel, TimeChart } from '@/components/LabChart';
import { VITAL_STATUS_TEXT } from '@/components/VitalStatus';
import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { useQuery } from '@/lib/useQuery';
import { formatVital, measuredMs, rangeText, SUGAR_CONTEXTS, typicalRange, vitalDef, VITALS, vitalStatus, whenText } from '@/lib/vitalsAnalysis';
import { listVitals } from '@/lib/vitals';
import type { VitalType } from '@/lib/types';

const RANGES = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '6m', label: '6 months', days: 183 },
  { key: 'all', label: 'All', days: null },
] as const;

export default function VitalDetailScreen() {
  const params = useLocalSearchParams<{ type: string; memberId: string }>();
  const type = (VITALS.some((v) => v.type === params.type) ? params.type : 'bp') as VitalType;
  const def = vitalDef(type);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30d');
  const [context, setContext] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const load = useCallback(
    async () => ({ member: await getMember(db, params.memberId), readings: await listVitals(db, params.memberId, type) }),
    [db, params.memberId, type]
  );
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, readings } = data;
  const add = () => router.push({ pathname: '/vitals/add', params: { memberId: params.memberId, type } });
  const title = `${member ? `${member.name.split(' ')[0]} · ` : ''}${def.label}`;

  if (!readings.length) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState icon={def.icon} title="No readings yet" message={`Log ${def.label.toLowerCase()} readings to see the trend over time.`}>
          <Button title="Log a reading" icon="add-outline" onPress={add} />
        </EmptyState>
      </>
    );
  }

  const latest = readings[readings.length - 1];
  const latestStatus = vitalStatus(latest);
  const days = RANGES.find((r) => r.key === range)!.days;
  const since = days === null ? 0 : now - days * 86400000;
  // Sugar readings taken at different times aren't comparable, so the chart shows one kind at a time.
  const sugarContext = type === 'sugar' ? (context ?? latest.context) : null;
  const shown = readings.filter((r) => measuredMs(r.measuredAt) >= since && (sugarContext === null || r.context === sugarContext));
  const points = shown.map((r) => ({ t: measuredMs(r.measuredAt), value: r.value, value2: r.value2 }));
  const span = points.length ? points[points.length - 1].t - points[0].t : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable accessibilityLabel="Log a reading" hitSlop={8} onPress={add}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 34, fontWeight: '700', color: latestStatus === 'above' || latestStatus === 'below' ? labColors.out : colors.text }}>
              {formatVital(latest)}
            </Text>
            <Text style={{ fontSize: 15, color: colors.muted }}>{def.unit}</Text>
          </View>
          <Text style={styles.subtitle}>
            {whenText(latest.measuredAt)}
            {latest.context ? ` · ${SUGAR_CONTEXTS.find((c) => c.key === latest.context)?.label ?? latest.context}` : ''}
          </Text>
          {VITAL_STATUS_TEXT[latestStatus].text ? (
            <Text style={{ fontWeight: '600', color: VITAL_STATUS_TEXT[latestStatus].color }}>{VITAL_STATUS_TEXT[latestStatus].text}</Text>
          ) : null}
          <Text style={[styles.subtitle, { fontSize: 12 }]}>{rangeText(type, sugarContext ?? '')}</Text>

          {type === 'sugar' ? (
            <View style={[styles.chips, { marginTop: 6 }]}>
              {SUGAR_CONTEXTS.map((c) => {
                const on = c.key === sugarContext;
                return (
                  <Pressable key={c.key} onPress={() => setContext(c.key)} style={[styles.chip, on && styles.chipSelected]}>
                    <Text style={[styles.chipText, on && styles.chipTextSelected]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View role="tablist" style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.subtle, borderRadius: 10, padding: 3, marginTop: 6 }}>
            {RANGES.map((r) => (
              <Pressable
                key={r.key}
                role="tab"
                accessibilityState={{ selected: r.key === range }}
                onPress={() => setRange(r.key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: r.key === range ? colors.card : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: r.key === range ? colors.text : colors.muted }}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          {points.length > 1 ? (
            <View style={{ marginTop: 8 }}>
              <TimeChart
                points={points}
                unit={def.unit}
                band={type === 'bp' ? null : typicalRange(type, sugarContext ?? '')}
                refLines={type === 'bp' ? [120, 80] : []}
                color={def.color}
                xLabel={(t) => shortTimeLabel(t, span)}
                isOut={(p) => {
                  const s = vitalStatus({ type, value: p.value, value2: p.value2 ?? null, context: sugarContext ?? '' });
                  return s === 'above' || s === 'below';
                }}
              />
              {type === 'bp' ? (
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: def.color, fontWeight: '600' }}>● Top (systolic)</Text>
                  <Text style={{ fontSize: 12, color: '#EA580C', fontWeight: '600' }}>● Bottom (diastolic)</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>- - 120 / 80</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.subtitle, { marginTop: 8 }]}>
              {points.length ? 'Log another reading to see a trend chart.' : 'No readings in this period.'}
            </Text>
          )}
        </Card>

        <SectionTitle>All readings ({readings.length})</SectionTitle>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {[...readings].reverse().map((r, i) => {
            const s = vitalStatus(r);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/vitals/add', params: { id: r.id } })}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle },
                  pressed && styles.pressed,
                ]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{whenText(r.measuredAt)}</Text>
                  {r.context || r.notes ? (
                    <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]} numberOfLines={1}>
                      {[SUGAR_CONTEXTS.find((c) => c.key === r.context)?.label, r.notes].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: s === 'above' || s === 'below' ? labColors.out : colors.text }}>
                  {formatVital(r)}
                </Text>
              </Pressable>
            );
          })}
        </Card>
        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          Typical ranges are general adult guides, not targets. Talk to your doctor about what is right for you.
        </Text>
      </ScrollView>
    </>
  );
}
