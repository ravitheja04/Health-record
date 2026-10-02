import { Pressable, Text, View } from 'react-native';

import { labColors, Sparkline } from './LabChart';
import { colors, styles } from './ui';
import { formatDelta, formatRange, formatValue, type LabChange, type LabStatus, type TestSeries } from '@/lib/labAnalysis';

export function StatusChip({ status }: { status: LabStatus }) {
  if (status === 'unknown') return null;
  const out = status !== 'normal';
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: out ? labColors.outText : colors.okText,
        backgroundColor: out ? labColors.outSoft : colors.okBg,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
        overflow: 'hidden',
      }}>
      {status === 'high' ? 'High' : status === 'low' ? 'Low' : 'In range'}
    </Text>
  );
}

/** "▼ 0.2" in blue when it moved toward the range, orange when away, grey otherwise. */
export function ChangeText({ change, style }: { change: LabChange; style?: object }) {
  if (change.unitChanged) {
    return <Text style={[{ fontSize: 12, color: colors.muted }, style]}>Unit changed</Text>;
  }
  if (change.delta === null) return null;
  const color = change.kind === 'toward' ? labColors.toward : change.kind === 'away' ? labColors.out : colors.muted;
  return <Text style={[{ fontSize: 12, fontWeight: '600', color }, style]}>{formatDelta(change.delta)}</Text>;
}

export function TestRow({ series, onPress, last }: { series: TestSeries; onPress: () => void; last?: boolean }) {
  const out = series.status === 'high' || series.status === 'low';
  const range = formatRange(series.latest.refLow, series.latest.refHigh, series.unit);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${series.testName}, latest ${formatValue(series.latest.value)} ${series.unit}`}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: colors.subtle,
        },
        pressed && styles.pressed,
      ]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[styles.title, { fontSize: 15 }]} numberOfLines={1}>
            {series.testName}
          </Text>
          <StatusChip status={series.status} />
        </View>
        <Text style={[styles.subtitle, { fontSize: 12 }]} numberOfLines={1}>
          {range ? `Range ${range}` : 'No range on report'} · {series.points.length} result{series.points.length === 1 ? '' : 's'}
        </Text>
      </View>
      <Sparkline values={series.points.map((p) => p.value)} color={out ? labColors.out : labColors.neutral} />
      <View style={{ width: 82, alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: out ? labColors.out : colors.text }}>
          {formatValue(series.latest.value)} <Text style={{ fontSize: 12, fontWeight: '500' }}>{series.unit}</Text>
        </Text>
        <ChangeText change={series.change} />
      </View>
    </Pressable>
  );
}
