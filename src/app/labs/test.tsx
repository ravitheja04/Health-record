import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors, TrendChart } from '@/components/LabChart';
import { ChangeText, StatusChip } from '@/components/LabRows';
import { Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { formatDate, todayIso } from '@/lib/format';
import { buildSeries, changeBetween, formatRange, formatValue, statusOf, testCadence } from '@/lib/labAnalysis';
import { listMemberResults } from '@/lib/labs';
import { useQuery } from '@/lib/useQuery';

export default function LabTestScreen() {
  const { memberId, testKey } = useLocalSearchParams<{ memberId: string; testKey: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const points = await listMemberResults(db, memberId);
    return buildSeries(points.filter((p) => p.testKey === testKey))[0] ?? null;
  }, [db, memberId, testKey]);
  const { data: series } = useQuery(load);

  if (series === undefined) return null;
  if (series === null) {
    return <EmptyState icon="flask-outline" title="No results" message="This test has no results any more." />;
  }

  const { latest, previous, points, unit } = series;
  const out = series.status === 'high' || series.status === 'low';
  const range = formatRange(latest.refLow, latest.refHigh, unit);
  const cadence = testCadence(points);
  const newestFirst = [...points].reverse();
  // Only plot results in the latest unit; a unit change would make the line meaningless.
  const chartPoints = points.filter((p) => p.unit.trim().toLowerCase() === unit.trim().toLowerCase());

  return (
    <>
      <Stack.Screen options={{ title: series.testName }} />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 34, fontWeight: '700', color: out ? labColors.out : colors.text }}>
              {formatValue(latest.value)}
            </Text>
            <Text style={{ fontSize: 15, color: colors.muted }}>{unit}</Text>
            <StatusChip status={series.status} />
          </View>
          <Text style={styles.subtitle}>
            {formatDate(latest.date)}
            {previous ? ` · since ${formatDate(previous.date)}: ` : ''}
            {previous ? <ChangeText change={series.change} style={{ fontSize: 13 }} /> : null}
          </Text>
          <Text style={styles.subtitle}>{range ? `Normal range on latest report: ${range}` : 'The latest report gives no normal range.'}</Text>

          {chartPoints.length > 1 ? (
            <View style={{ marginTop: 8 }}>
              <TrendChart points={chartPoints} refLow={latest.refLow} refHigh={latest.refHigh} unit={unit} />
              {latest.refLow !== null || latest.refHigh !== null ? (
                <View style={[styles.row, { gap: 6, marginTop: 4 }]}>
                  <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: labColors.band }} />
                  <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>Normal range</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.subtitle, { marginTop: 8 }]}>Add this test from another report to see a trend chart.</Text>
          )}
        </Card>

        {cadence ? (
          <Card>
            <Text style={styles.title}>
              Tested about every {cadence.months} month{cadence.months === 1 ? '' : 's'}
            </Text>
            <Text style={styles.subtitle}>
              {cadence.nextDate >= todayIso() ? 'Next one would be around ' : 'At that pace one was due around '}
              {formatDate(cadence.nextDate)}
            </Text>
          </Card>
        ) : null}

        <SectionTitle>All results ({points.length})</SectionTitle>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {newestFirst.map((p, i) => {
            const before = newestFirst[i + 1] ?? null;
            const status = statusOf(p.value, p.refLow, p.refHigh);
            const pOut = status === 'high' || status === 'low';
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/record/[id]', params: { id: p.recordId } })}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderBottomWidth: i === newestFirst.length - 1 ? 0 : 1,
                    borderBottomColor: '#F1F5F9',
                  },
                  pressed && styles.pressed,
                ]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.body, { fontWeight: '600' }]}>{formatDate(p.date)}</Text>
                  <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]} numberOfLines={1}>
                    {p.recordTitle}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: pOut ? labColors.out : colors.text }}>
                    {formatValue(p.value)} <Text style={{ fontSize: 12, fontWeight: '500' }}>{p.unit}</Text>
                  </Text>
                  <ChangeText change={changeBetween(before, p)} />
                </View>
                <Icon name="chevron-forward-outline" size={16} color={colors.muted} />
              </Pressable>
            );
          })}
        </Card>

        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          Ranges come from each lab report. Talk to your doctor about what these results mean for you.
        </Text>
      </ScrollView>
    </>
  );
}
