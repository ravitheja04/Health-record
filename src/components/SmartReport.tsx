import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { labColors, Sparkline } from './LabChart';
import { ChangeText, StatusChip } from './LabRows';
import { Card, colors, Icon, styles } from './ui';
import { formatDate } from '@/lib/format';
import { changeBetween, formatRange, formatValue, type LabChange, type LabStatus } from '@/lib/labAnalysis';
import type { PanelKey } from '@/lib/labTests';
import { aboutTest, cellStatus, type RangeBar, type SmartPanel, type SmartReport, type SmartTest } from '@/lib/smartReport';
import { t } from '@/i18n';

/**
 * The smart report: every lab test a member has had, from the first report
 * to the chosen one, grouped by body system, in the style of the reports
 * Indian labs send. Shown in the Records tab and on its own screen.
 */

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

const isOut = (s: LabStatus) => s === 'high' || s === 'low';

function changeWords(c: LabChange) {
  if (c.unitChanged) return t('Unit changed between reports');
  if (c.kind === 'toward') return t('Moved toward range');
  if (c.kind === 'away') return t('Moved away from range');
  if (c.kind === 'same') return t('About the same against range');
  return '';
}

export function Segmented<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View role="tablist" style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.subtle, borderRadius: 10, padding: 3 }}>
      {items.map(([key, label]) => (
        <Pressable
          key={key}
          role="tab"
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: value === key ? colors.card : 'transparent' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: value === key ? colors.text : colors.muted }} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** In range / outside / no range, as one bar with counts underneath. */
function SummaryBar({ inRange, out, noRange }: { inRange: number; out: number; noRange: number }) {
  const total = Math.max(1, inRange + out + noRange);
  const parts = [
    { n: inRange, color: colors.okText, label: t('{n} in range', { n: inRange }) },
    { n: out, color: labColors.out, label: t('{n} out of range', { n: out }) },
    { n: noRange, color: colors.border, label: t('{n} without a range', { n: noRange }) },
  ];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.subtle }}>
        {parts.map((p, i) => (p.n ? <View key={i} style={{ flex: p.n / total, backgroundColor: p.color }} /> : null))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
        {parts.map((p, i) =>
          p.n ? (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text style={{ fontSize: 12, color: colors.text }}>{p.label}</Text>
            </View>
          ) : null
        )}
      </View>
    </View>
  );
}

/** Body-system chips that filter the list; each shows how many tests are outside their range. */
function PanelStrip({ panels, value, onChange }: { panels: SmartPanel[]; value: PanelKey | null; onChange: (v: PanelKey | null) => void }) {
  const chip = (key: PanelKey | null, label: string, icon: string, out: number) => {
    const selected = value === key;
    return (
      <Pressable
        key={key ?? 'all'}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={out ? `${label}, ${t('{n} out of range', { n: out })}` : label}
        onPress={() => onChange(key)}
        style={[styles.chip, { flexDirection: 'row', alignItems: 'center', gap: 6 }, selected && styles.chipSelected]}>
        <Icon name={icon} size={15} color={selected ? colors.onPrimary : colors.muted} />
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
        {key !== null ? (
          out ? (
            <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: labColors.out, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{out}</Text>
            </View>
          ) : (
            <Icon name="checkmark-circle" size={15} color={selected ? colors.onPrimary : colors.okText} />
          )
        ) : null}
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {chip(null, t('All'), 'apps-outline', 0)}
      {panels.map((p) => chip(p.key, p.label, PANEL_ICONS[p.key], p.outOfRange))}
    </ScrollView>
  );
}

/** A thin bar with the normal range shaded and a dot where the value sits. */
function RangeBarView({ bar, out, labels }: { bar: RangeBar; out: boolean; labels?: { low: number | null; high: number | null } }) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%` as const;
  return (
    <View style={{ marginTop: 4, marginBottom: labels ? 14 : 2 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: labColors.outSoft, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: pct(bar.low), width: pct(bar.high - bar.low), top: 0, bottom: 0, backgroundColor: colors.okText, opacity: 0.4 }} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: pct(bar.value),
          top: -4,
          width: 14,
          height: 14,
          marginLeft: -7,
          borderRadius: 7,
          borderWidth: 2.5,
          borderColor: colors.card,
          backgroundColor: out ? labColors.out : colors.okText,
        }}
      />
      {labels?.low != null ? (
        <Text style={{ position: 'absolute', top: 9, left: pct(bar.low), width: 60, marginLeft: -30, textAlign: 'center', fontSize: 10, color: colors.muted }}>
          {formatValue(labels.low)}
        </Text>
      ) : null}
      {labels?.high != null ? (
        <Text style={{ position: 'absolute', top: 9, left: pct(bar.high), width: 60, marginLeft: -30, textAlign: 'center', fontSize: 10, color: colors.muted }}>
          {formatValue(labels.high)}
        </Text>
      ) : null}
    </View>
  );
}

/** One test: a compact row that opens to show what it measures and its whole history. */
function TestRow({ test, memberId, open, onToggle, last }: { test: SmartTest; memberId: string; open: boolean; onToggle: () => void; last: boolean }) {
  const out = isOut(test.status);
  const range = formatRange(test.latest.refLow, test.latest.refHigh, test.unit);
  const previous = test.points.length > 1 ? test.points[test.points.length - 2] : null;
  const sinceLast = previous ? changeBetween(previous, test.latest) : null;
  const about = aboutTest(test.testKey);
  const words = changeWords(test.overall);
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.subtle }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${test.testName}, ${formatValue(test.latest.value)} ${test.unit}`}
        onPress={onToggle}
        style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 12, gap: 6 }, pressed && styles.pressed]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.title, { fontSize: 15 }]} numberOfLines={1}>
                {test.testName}
              </Text>
              <StatusChip status={test.status} />
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
              {range ? t('Normal range {range}', { range }) : t('No range on report')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: out ? labColors.out : colors.text }}>
              {formatValue(test.latest.value)} <Text style={{ fontSize: 11, fontWeight: '500', color: colors.muted }}>{test.unit}</Text>
            </Text>
            {sinceLast ? <ChangeText change={sinceLast} /> : <Text style={{ fontSize: 11, color: colors.muted }}>{t('First result')}</Text>}
          </View>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </View>
        {test.bar ? <RangeBarView bar={test.bar} out={out} labels={open ? { low: test.latest.refLow, high: test.latest.refHigh } : undefined} /> : null}
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
          {about ? <Text style={[styles.subtitle, { marginTop: 0, lineHeight: 18 }]}>{about}</Text> : null}

          {test.points.length > 1 ? (
            <View style={{ backgroundColor: colors.subtle, borderRadius: 10, padding: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('First · {date}', { date: formatDate(test.first.date) })}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: isOut(cellStatus(test.first)) ? labColors.out : colors.text }}>
                    {formatValue(test.first.value)} {test.first.unit}
                  </Text>
                </View>
                <Sparkline values={test.points.map((p) => p.value)} color={out ? labColors.out : labColors.line} width={84} height={30} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('Overall change')}</Text>
                  <ChangeText change={test.overall} style={{ fontSize: 15 }} />
                </View>
              </View>
              {words ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: test.overall.kind === 'toward' ? labColors.toward : test.overall.kind === 'away' ? labColors.outText : colors.muted }}>
                  {words}
                </Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {[...test.points].reverse().map((p) => {
                  const o = isOut(cellStatus(p));
                  return (
                    <View key={p.id} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: o ? labColors.outSoft : colors.card }}>
                      <Text style={{ fontSize: 10, color: colors.muted }}>{formatDate(p.date)}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: o ? labColors.outText : colors.text }}>{formatValue(p.value)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={[styles.hint, { fontSize: 12 }]}>{t('Only one result so far. The next report will show the change.')}</Text>
          )}

          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => router.push({ pathname: '/labs/test', params: { memberId, testKey: test.testKey } })}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('Open trend chart')} ›</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const NAME_W = 132;
const COL_W = 86;
const ROW_H = 44;
const HEAD_H = 52;

/** Tests down the side, reports across (oldest to newest), scrolled to the newest. */
function ReportTable({ report, panels, memberId }: { report: SmartReport; panels: SmartPanel[]; memberId: string }) {
  const scroll = useRef<ScrollView>(null);
  type Row = { kind: 'panel'; panel: SmartPanel } | { kind: 'test'; test: SmartTest };
  const rows: Row[] = panels.flatMap((p) => [{ kind: 'panel' as const, panel: p }, ...p.tests.map((x) => ({ kind: 'test' as const, test: x }))]);
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
            <View key={`p-${r.panel.key}`} style={{ height: 30, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.subtle }}>
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
            {report.columns.map((c) => (
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
                  const st = p ? cellStatus(p) : 'unknown';
                  const o = isOut(st);
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
                          {st === 'high' ? ' ↑' : st === 'low' ? ' ↓' : ''}
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

/** Lets you look at the report as it stood at any earlier lab report. */
export function ReportPicker({ report, value, onChange }: { report: SmartReport; value: string | null; onChange: (recordId: string | null) => void }) {
  if (report.allColumns.length < 2) return null;
  const newestFirst = [...report.allColumns].reverse();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {newestFirst.map((c, i) => {
        const selected = value === null ? i === 0 : value === c.recordId;
        return (
          <Pressable
            key={c.recordId}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(i === 0 ? null : c.recordId)}
            style={[styles.chip, { paddingVertical: 6 }, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, { fontSize: 13 }, selected && styles.chipTextSelected]}>{i === 0 ? t('Latest · {date}', { date: formatDate(c.date) }) : formatDate(c.date)}</Text>
            <Text style={[{ fontSize: 10, color: colors.muted, maxWidth: 140 }, selected && { color: colors.onPrimary }]} numberOfLines={1}>
              {c.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SmartReportView({ report, memberId, header }: { report: SmartReport; memberId: string; header?: React.ReactNode }) {
  const [view, setView] = useState<'summary' | 'table'>('summary');
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [onlyOut, setOnlyOut] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const all = report.panels.flatMap((p) => p.tests);
  const inRange = all.filter((x) => x.status === 'normal').length;
  const noRange = all.filter((x) => x.status === 'unknown').length;
  const latest = report.columns[report.columns.length - 1];
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const panels = report.panels
    .filter((p) => !panel || p.key === panel)
    .map((p) => ({ ...p, tests: [...p.tests].filter((x) => !onlyOut || isOut(x.status)).sort((a, b) => Number(isOut(b.status)) - Number(isOut(a.status))) }))
    .filter((p) => p.tests.length);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        {header}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>{report.testCount}</Text>
          <Text style={[styles.subtitle, { flex: 1, marginTop: 0 }]}>
            {report.columns.length > 1
              ? t('tests across {n} reports, {from} to {to}', { n: report.columns.length, from: formatDate(report.firstDate), to: formatDate(report.latestDate) })
              : t('tests in the report of {date}', { date: formatDate(report.latestDate) })}
          </Text>
        </View>
        <SummaryBar inRange={inRange} out={report.outOfRange} noRange={noRange} />
        {latest ? (
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
            {t('Values shown are from each test’s latest result up to {date} ({title}).', { date: formatDate(latest.date), title: latest.title })}
          </Text>
        ) : null}
      </Card>

      <PanelStrip panels={report.panels} value={panel} onChange={setPanel} />

      <Segmented
        items={[
          ['summary', t('Summary')],
          ['table', t('All reports table')],
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'summary' ? (
        <>
          {report.outOfRange ? (
            <Segmented
              items={[
                ['all', t('All tests')],
                ['out', t('Out of range ({n})', { n: report.outOfRange })],
              ]}
              value={onlyOut ? 'out' : 'all'}
              onChange={(v) => setOnlyOut(v === 'out')}
            />
          ) : null}
          {panels.length ? (
            panels.map((p) => (
              <View key={p.key} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Icon name={PANEL_ICONS[p.key]} size={16} color={p.outOfRange ? labColors.outText : colors.okText} />
                  <Text style={[styles.sectionTitle, { flex: 1 }]}>{p.label}</Text>
                  <Text style={{ fontSize: 12, color: p.outOfRange ? labColors.outText : colors.okText, fontWeight: '600' }}>
                    {p.outOfRange ? t('{n} out of range', { n: p.outOfRange }) : p.inRange ? t('All in range') : t('No range on report')}
                  </Text>
                </View>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {p.tests.map((x, i) => (
                    <TestRow key={x.testKey} test={x} memberId={memberId} open={open.has(x.testKey)} onToggle={() => toggle(x.testKey)} last={i === p.tests.length - 1} />
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 12 }]}>{t('Nothing out of range here.')}</Text>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.subtitle, { lineHeight: 18, marginTop: 0 }]}>
            {t('Every test across every report, oldest on the left. Highlighted values were outside the range printed on that report. Scroll sideways for older reports.')}
          </Text>
          <ReportTable report={report} panels={report.panels.filter((p) => !panel || p.key === panel)} memberId={memberId} />
        </>
      )}

      <Text style={[styles.subtitle, { lineHeight: 18 }]}>
        {t('Ranges come from each lab report. This summary only shows where values sit and how they moved; it is not a diagnosis. Talk to your doctor about what your results mean for you.')}
      </Text>
    </View>
  );
}
