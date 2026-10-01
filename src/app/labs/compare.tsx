import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors } from '@/components/LabChart';
import { ChangeText } from '@/components/LabRows';
import { Card, colors, EmptyState, styles } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { changeBetween, formatValue, statusOf, type LabPoint } from '@/lib/labAnalysis';
import { listMemberResults } from '@/lib/labs';
import { getTestDef, PANELS, panelOf } from '@/lib/labTests';
import { useQuery } from '@/lib/useQuery';

type Report = { recordId: string; date: string; title: string };

function ReportPicker({ label, reports, value, onChange }: {
  label: string;
  reports: Report[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {reports.map((r) => {
          const selected = r.recordId === value;
          return (
            <Pressable
              key={r.recordId}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(r.recordId)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{formatDate(r.date)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function valueColor(p: LabPoint | undefined) {
  if (!p) return colors.muted;
  const s = statusOf(p.value, p.refLow, p.refHigh);
  return s === 'high' || s === 'low' ? labColors.out : colors.text;
}

const COL = 58;

export default function CompareScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(() => listMemberResults(db, memberId), [db, memberId]);
  const { data: points } = useQuery(load);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  if (!points) return null;

  const reports: Report[] = [];
  for (const p of points) {
    if (!reports.some((r) => r.recordId === p.recordId)) reports.push({ recordId: p.recordId, date: p.date, title: p.recordTitle });
  }
  reports.sort((a, b) => b.date.localeCompare(a.date));
  if (reports.length < 2) {
    return <EmptyState icon="swap-vertical-outline" title="Need two reports" message="Add test results from at least two lab reports to compare them." />;
  }

  const after = afterId ?? reports[0].recordId;
  const before = beforeId ?? reports.find((r) => r.recordId !== after)!.recordId;
  const beforeReport = reports.find((r) => r.recordId === before)!;
  const afterReport = reports.find((r) => r.recordId === after)!;

  const keys = [...new Set(points.filter((p) => p.recordId === before || p.recordId === after).map((p) => p.testKey))];
  const pick = (recordId: string, key: string) => points.find((p) => p.recordId === recordId && p.testKey === key);
  const rows = keys.map((key) => {
    const a = pick(before, key);
    const b = pick(after, key);
    return {
      key,
      name: getTestDef(key)?.name ?? (b ?? a)!.testName,
      panel: panelOf(key),
      a,
      b,
      change: a && b ? changeBetween(a, b) : null,
    };
  });
  const toward = rows.filter((r) => r.change?.kind === 'toward').length;
  const away = rows.filter((r) => r.change?.kind === 'away').length;
  const same = rows.filter((r) => r.change && r.change.kind !== 'toward' && r.change.kind !== 'away').length;
  const shortLabel = (d: string) => formatDate(d).split(' ').slice(1).join(' ');

  return (
    <>
      <Stack.Screen options={{ title: 'Compare reports' }} />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <ReportPicker label="Before" reports={reports} value={before} onChange={(id) => (id === after ? null : setBeforeId(id))} />
        <ReportPicker label="After" reports={reports} value={after} onChange={(id) => (id === before ? null : setAfterId(id))} />
        {beforeReport.date > afterReport.date ? (
          <Text style={[styles.subtitle, { color: labColors.outText }]}>“Before” is newer than “After”, so changes read backwards.</Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E40AF' }}>{toward}</Text>
            <Text style={{ fontSize: 12, color: '#1E40AF' }}>toward range</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#FFF7ED', borderRadius: 12, padding: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: labColors.outText }}>{away}</Text>
            <Text style={{ fontSize: 12, color: labColors.outText }}>away from range</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#334155' }}>{same}</Text>
            <Text style={{ fontSize: 12, color: '#334155' }}>steady</Text>
          </View>
        </View>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F8FAFC', gap: 6 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.muted }}>TEST</Text>
            <Text style={{ width: COL, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.muted }}>
              {shortLabel(beforeReport.date).toUpperCase()}
            </Text>
            <Text style={{ width: COL, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.muted }}>
              {shortLabel(afterReport.date).toUpperCase()}
            </Text>
            <Text style={{ width: COL + 6, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.muted }}>CHANGE</Text>
          </View>
          {PANELS.map((panel) => {
            const list = rows.filter((r) => r.panel === panel.key).sort((x, y) => x.name.localeCompare(y.name));
            if (!list.length) return null;
            return (
              <View key={panel.key}>
                <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, fontSize: 12, fontWeight: '700', color: colors.muted }}>
                  {panel.label}
                </Text>
                {list.map((r) => (
                  <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, gap: 6 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={2}>
                      {r.name} <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '400' }}>{(r.b ?? r.a)!.unit}</Text>
                    </Text>
                    <Text style={{ width: COL, textAlign: 'right', fontSize: 14, fontWeight: '600', color: valueColor(r.a) }}>
                      {r.a ? formatValue(r.a.value) : '—'}
                    </Text>
                    <Text style={{ width: COL, textAlign: 'right', fontSize: 14, fontWeight: '700', color: valueColor(r.b) }}>
                      {r.b ? formatValue(r.b.value) : '—'}
                    </Text>
                    <View style={{ width: COL + 6, alignItems: 'flex-end' }}>
                      {r.change ? <ChangeText change={r.change} /> : <Text style={{ fontSize: 12, color: colors.muted }}>—</Text>}
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
          <View style={{ height: 8 }} />
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={[styles.row, { gap: 5 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: labColors.out }} />
            <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>Outside the report’s range</Text>
          </View>
          <View style={[styles.row, { gap: 5 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: labColors.toward }} />
            <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>Moved toward range</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
