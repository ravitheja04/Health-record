import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors } from '@/components/LabChart';
import { TestRow } from '@/components/LabRows';
import { Button, Card, EmptyState, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { buildSeries, summarize, type TestSeries } from '@/lib/labAnalysis';
import { listMemberResults } from '@/lib/labs';
import { useQuery } from '@/lib/useQuery';

function Stat({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 12, padding: 10 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color }}>{label}</Text>
    </View>
  );
}

function Section({ title, color, list, memberId }: { title: string; color?: string; list: TestSeries[]; memberId: string }) {
  if (!list.length) return null;
  return (
    <>
      <SectionTitle>
        <Text style={color ? { color } : undefined}>{title}</Text>
      </SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {list.map((s, i) => (
          <TestRow
            key={s.testKey}
            series={s}
            last={i === list.length - 1}
            onPress={() => router.push({ pathname: '/labs/test', params: { memberId, testKey: s.testKey } })}
          />
        ))}
      </Card>
    </>
  );
}

export default function LabTrendsScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const [member, points] = await Promise.all([getMember(db, memberId), listMemberResults(db, memberId)]);
    const series = buildSeries(points);
    return { member, series, summary: summarize(series, points) };
  }, [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, series, summary } = data;
  const title = member ? `${member.name.split(' ')[0]}’s lab trends` : 'Lab trends';

  if (!series.length) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState
          icon="flask-outline"
          title="No test results yet"
          message="Open a lab report, tap “Add test results” and type in the values. Each new report adds a point to the trend.">
          <Button
            title="Add a lab report"
            icon="add-outline"
            onPress={() => router.push({ pathname: '/record/edit', params: { memberId, type: 'lab' } })}
          />
        </EmptyState>
      </>
    );
  }

  const out = series.filter((s) => s.status === 'high' || s.status === 'low');
  const inRange = series.filter((s) => s.status === 'normal');
  const noRange = series.filter((s) => s.status === 'unknown');

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.subtitle}>
            Latest report <Text style={{ fontWeight: '600', color: '#0F172A' }}>{formatDate(summary.latestDate)}</Text> ·{' '}
            {summary.reportCount} report{summary.reportCount === 1 ? '' : 's'} since {formatDate(summary.firstDate)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat value={summary.testsTracked} label="tests tracked" color="#0F172A" bg="#F8FAFC" />
            <Stat value={summary.outOfRange} label="out of range" color={labColors.outText} bg="#FFF7ED" />
            <Stat value={summary.movedToward} label="moved toward range" color="#1E40AF" bg="#EFF6FF" />
          </View>
          {summary.reportCount > 1 ? (
            <Button
              title="Compare two reports"
              icon="swap-vertical-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/labs/compare', params: { memberId } })}
            />
          ) : null}
        </Card>

        <Section title="Out of range" color={labColors.outText} list={out} memberId={memberId} />
        <Section title="Within range" list={inRange} memberId={memberId} />
        <Section title="No range on report" list={noRange} memberId={memberId} />

        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          Changes compare each test with its previous result. Blue means it moved toward the report’s normal range, orange means it
          moved away. Ranges come from each lab report; talk to your doctor about what results mean for you.
        </Text>
      </ScrollView>
    </>
  );
}
