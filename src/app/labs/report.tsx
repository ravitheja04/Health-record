import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors, Sparkline } from '@/components/LabChart';
import { ChangeText, StatusChip } from '@/components/LabRows';
import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { formatRange, formatValue, type LabChange } from '@/lib/labAnalysis';
import { listMemberResults } from '@/lib/labs';
import type { PanelKey } from '@/lib/labTests';
import { shareSmartReportPdf } from '@/lib/share';
import { aboutTest, buildSmartReport, cellStatus, type RangeBar, type ReportColumn, type SmartPanel, type SmartReport, type SmartTest } from '@/lib/smartReport';
import { showError, useQuery } from '@/lib/useQuery';
import { t } from '@/i18n';

const PANEL_ICONS: Record<PanelKey, string> = {
  diabetes: 'water-outline',
  lipid: 'heart-outline',
  thyroid: 'pulse-outline',
  kidney: 'filter-outline',
  liver: 'leaf-outline',
  blood: 'color-fill-outline',
  vitamins: 'sunny-outline',
  other: 'flask-outline',
};

function isOut(s: SmartTest['status']) {
  return s === 'high' || s === 'low';
}

function changeWords(c: LabChange) {
  if (c.unitChanged) return t('Unit changed between reports');
  if (c.kind === 'toward') return t('Moved toward range');
  if (c.kind === 'away') return t('Moved away from range');
  if (c.kind === 'same') return t('About the same against range');
  return '';
}

function GlanceTile({ panel, selected, onPress }: { panel: SmartPanel; selected: boolean; onPress: () => void }) {
  const out = panel.outOfRange > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: '48.5%',
          borderRadius: 12,
          padding: 10,
          gap: 4,
          borderWidth: 1.5,
          borderColor: selected ? colors.primary : out ? labColors.outSoft : colors.okBg,
          backgroundColor: out ? labColors.outSoft : colors.okBg,
        },
        pressed && styles.pressed,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={PANEL_ICONS[panel.key]} size={16} color={out ? labColors.outText : colors.okText} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: out ? labColors.outText : colors.okText }} numberOfLines={1}>
          {panel.label}
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: out ? labColors.outText : colors.okText }}>
        {out ? t('{n} out of range', { n: panel.outOfRange }) : panel.inRange ? t('All in range') : t('No range on report')}
        {out && panel.inRange ? ` · ${t('{n} in range', { n: panel.inRange })}` : ''}
      </Text>
      {panel.noRange ? <Text style={{ fontSize: 11, color: colors.muted }}>{t('{n} without a range', { n: panel.noRange })}</Text> : null}
    </Pressable>
  );
}

/** A bar with the normal range in green and a dot where the latest value sits. */
function RangeBarView({ bar, low, high, out }: { bar: RangeBar; low: number | null; high: number | null; out: boolean }) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%` as const;
  return (
    <View style={{ marginTop: 6, marginBottom: 14 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: labColors.outSoft, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: pct(bar.low), width: pct(bar.high - bar.low), top: 0, bottom: 0, backgroundColor: colors.okText, opacity: 0.45 }} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: pct(bar.value),
          top: -4,
          width: 16,
          height: 16,
          marginLeft: -8,
          borderRadius: 8,
          borderWidth: 3,
          borderColor: colors.card,
          backgroundColor: out ? labColors.out : colors.okText,
        }}
      />
      {low !== null ? (
        <Text style={{ position: 'absolute', top: 11, left: pct(bar.low), width: 60, marginLeft: -30, textAlign: 'center', fontSize: 10, color: colors.muted }}>
          {formatValue(low)}
        </Text>
      ) : null}
      {high !== null ? (
        <Text style={{ position: 'absolute', top: 11, left: pct(bar.high), width: 60, marginLeft: -30, textAlign: 'center', fontSize: 10, color: colors.muted }}>
          {formatValue(high)}
        </Text>
      ) : null}
    </View>
  );
}

function TestCard({ test, memberId }: { test: SmartTest; memberId: string }) {
  const out = isOut(test.status);
  const range = formatRange(test.latest.refLow, test.latest.refHigh, test.unit);
  const about = aboutTest(test.testKey);
  const history = [...test.points].reverse();
  const words = changeWords(test.overall);
  return (
    <Card style={{ gap: 6 }} onPress={() => router.push({ pathname: '/labs/test', params: { memberId, testKey: test.testKey } })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={1}>
          {test.testName}
        </Text>
        <StatusChip status={test.status} />
        <View style={{ flex: 1 }} />
        <Icon name="chevron-forward" size={16} color={colors.muted} />
      </View>
      {about ? <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>{about}</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 2 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: out ? labColors.out : colors.text }}>
            {formatValue(test.latest.value)} <Text style={{ fontSize: 13, fontWeight: '500', color: colors.muted }}>{test.unit}</Text>
          </Text>
          <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>
            {t('Latest · {date}', { date: formatDate(test.latest.date) })}
          </Text>
        </View>
        <Sparkline values={test.points.map((p) => p.value)} color={out ? labColors.out : labColors.line} width={90} height={34} />
      </View>

      {test.bar ? (
        <RangeBarView bar={test.bar} low={test.latest.refLow} high={test.latest.refHigh} out={out} />
      ) : null}
      <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>{range ? t('Normal range {range}', { range }) : t('No range on report')}</Text>

      {test.points.length > 1 ? (
        <View style={{ backgroundColor: colors.subtle, borderRadius: 10, padding: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('First · {date}', { date: formatDate(test.first.date) })}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isOut(cellStatus(test.first)) ? labColors.out : colors.text }}>
                {formatValue(test.first.value)} {test.first.unit}
              </Text>
            </View>
            <Icon name="arrow-forward" size={16} color={colors.muted} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('Overall change')}</Text>
              <ChangeText change={test.overall} style={{ fontSize: 15 }} />
            </View>
          </View>
          {words ? (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: test.overall.kind === 'toward' ? labColors.toward : test.overall.kind === 'away' ? labColors.outText : colors.muted,
              }}>
              {words}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.hint, { fontSize: 12 }]}>{t('Only one result so far. The next report will show the change.')}</Text>
      )}

      {test.points.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2 }}>
          {history.map((p) => {
            const o = isOut(cellStatus(p));
            return (
              <View key={p.id} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: o ? labColors.outSoft : colors.subtle }}>
                <Text style={{ fontSize: 10, color: colors.muted }}>{formatDate(p.date)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: o ? labColors.outText : colors.text }}>{formatValue(p.value)}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </Card>
  );
}

const NAME_W = 132;
const COL_W = 86;
const ROW_H = 44;
const HEAD_H = 52;

/** Tests down the side, reports across (oldest to newest), scrolled to the newest. */
function ReportTable({ report, memberId }: { report: SmartReport; memberId: string }) {
  const scroll = useRef<ScrollView>(null);
  type Row = { kind: 'panel'; panel: SmartPanel } | { kind: 'test'; test: SmartTest };
  const rows: Row[] = report.panels.flatMap((p) => [{ kind: 'panel' as const, panel: p }, ...p.tests.map((x) => ({ kind: 'test' as const, test: x }))]);
  const border = { borderBottomWidth: 1, borderBottomColor: colors.subtle };
  const openTest = (key: string) => router.push({ pathname: '/labs/test', params: { memberId, testKey: key } });

  return (
    <Card style={{ padding: 0, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: NAME_W, borderRightWidth: 1, borderRightColor: colors.border }}>
        <View style={[{ height: HEAD_H, justifyContent: 'center', paddingHorizontal: 10 }, border]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{t('Test')}</Text>
        </View>
        {rows.map((r) =>
          r.kind === 'panel' ? (
            <View key={`p-${r.panel.key}`} style={[{ height: 30, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.subtle }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                {r.panel.label}
              </Text>
            </View>
          ) : (
            <Pressable key={r.test.testKey} onPress={() => openTest(r.test.testKey)} style={[{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 10 }, border]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                {r.test.testName}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>
                {[r.test.unit, formatRange(r.test.latest.refLow, r.test.latest.refHigh)].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          )
        )}
      </View>
      <ScrollView ref={scroll} horizontal style={{ flex: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={{ flexDirection: 'row', height: HEAD_H, ...border }}>
            {report.columns.map((c: ReportColumn) => (
              <View key={c.recordId} style={{ width: COL_W, justifyContent: 'center', paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{formatDate(c.date)}</Text>
                <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={2}>
                  {c.title}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((r) =>
            r.kind === 'panel' ? (
              <View key={`p-${r.panel.key}`} style={{ height: 30, backgroundColor: colors.subtle }} />
            ) : (
              <View key={r.test.testKey} style={{ flexDirection: 'row', height: ROW_H, ...border }}>
                {report.columns.map((c) => {
                  const p = r.test.byRecord[c.recordId];
                  const o = p ? isOut(cellStatus(p)) : false;
                  return (
                    <View key={c.recordId} style={{ width: COL_W, justifyContent: 'center', paddingHorizontal: 6 }}>
                      {p ? (
                        <Text
                          style={{
                            alignSelf: 'flex-start',
                            fontSize: 14,
                            fontWeight: o ? '700' : '500',
                            color: o ? labColors.outText : colors.text,
                            backgroundColor: o ? labColors.outSoft : 'transparent',
                            borderRadius: 6,
                            paddingHorizontal: o ? 5 : 0,
                            overflow: 'hidden',
                          }}>
                          {formatValue(p.value)}
                          {cellStatus(p) === 'high' ? ' ↑' : cellStatus(p) === 'low' ? ' ↓' : ''}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 14, color: colors.border }}>—</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )
          )}
        </View>
      </ScrollView>
    </Card>
  );
}

export default function SmartReportScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'overview' | 'table'>('overview');
  const [panelFilter, setPanelFilter] = useState<PanelKey | null>(null);
  const [sharing, setSharing] = useState(false);
  const load = useCallback(async () => {
    const [member, points] = await Promise.all([getMember(db, memberId), listMemberResults(db, memberId)]);
    return { member, report: buildSmartReport(points) };
  }, [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, report } = data;
  const title = t('Smart report');

  if (!report.testCount) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="document-text-outline" title={t('No test results yet')} message={t('Add lab reports to build a smart report of every test from the first report to the latest.')}>
          <Button title={t('Read a lab report PDF')} icon="scan-outline" onPress={() => router.push({ pathname: '/record/import', params: { memberId } })} />
        </EmptyState>
      </>
    );
  }

  async function share() {
    setSharing(true);
    try {
      await shareSmartReportPdf(db, memberId);
    } catch (e) {
      showError(t('Could not share'), e);
    } finally {
      setSharing(false);
    }
  }

  const panels = panelFilter ? report.panels.filter((p) => p.key === panelFilter) : report.panels;
  const reportCount = report.columns.length;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable accessibilityLabel={t('Share as PDF')} hitSlop={8} onPress={share} disabled={sharing}>
              <Icon name="share-outline" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={{ gap: 10 }}>
          <View>
            {member ? <Text style={[styles.title, { fontSize: 18 }]}>{member.name}</Text> : null}
            <Text style={styles.subtitle}>
              {reportCount > 1
                ? t('{n} reports · {from} to {to}', { n: reportCount, from: formatDate(report.firstDate), to: formatDate(report.latestDate) })
                : t('1 report · {date}', { date: formatDate(report.latestDate) })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.subtle, borderRadius: 12, padding: 10 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{report.testCount}</Text>
              <Text style={{ fontSize: 12, color: colors.text }}>{t('tests tracked')}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.warnBg, borderRadius: 12, padding: 10 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: labColors.outText }}>{report.outOfRange}</Text>
              <Text style={{ fontSize: 12, color: labColors.outText }}>{t('out of range now')}</Text>
            </View>
          </View>
          <View role="tablist" style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.subtle, borderRadius: 10, padding: 3 }}>
            {(
              [
                ['overview', t('Overview')],
                ['table', t('All reports table')],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                role="tab"
                accessibilityState={{ selected: view === key }}
                onPress={() => setView(key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: view === key ? colors.card : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: view === key ? colors.text : colors.muted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {view === 'overview' ? (
          <>
            <SectionTitle
              action={
                panelFilter ? (
                  <Pressable hitSlop={8} onPress={() => setPanelFilter(null)}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('Show all')}</Text>
                  </Pressable>
                ) : undefined
              }>
              {t('Health at a glance')}
            </SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
              {report.panels.map((p) => (
                <GlanceTile key={p.key} panel={p} selected={panelFilter === p.key} onPress={() => setPanelFilter(panelFilter === p.key ? null : p.key)} />
              ))}
            </View>

            {panels.map((p) => (
              <View key={p.key} style={{ gap: 10 }}>
                <SectionTitle>{p.label}</SectionTitle>
                {[...p.tests]
                  .sort((a, b) => Number(isOut(b.status)) - Number(isOut(a.status)))
                  .map((x) => (
                    <TestCard key={x.testKey} test={x} memberId={memberId} />
                  ))}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { lineHeight: 18 }]}>
              {t('Every test across every report, oldest on the left. Highlighted values were outside the range printed on that report. Scroll sideways for older reports.')}
            </Text>
            <ReportTable report={report} memberId={memberId} />
          </>
        )}

        <Button title={t('Share as PDF')} icon="document-outline" variant="secondary" loading={sharing} onPress={share} />
        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          {t('Ranges come from each lab report. This summary only shows where values sit and how they moved; it is not a diagnosis. Talk to your doctor about what your results mean for you.')}
        </Text>
      </ScrollView>
    </>
  );
}
