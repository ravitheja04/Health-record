import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { formatValue } from '@/lib/labAnalysis';
import type { GrowthPoint, referenceCurves } from '@/lib/growth';

type Curves = ReturnType<typeof referenceCurves>;

const LINE_STYLE: Record<number, { stroke: string; dash?: string; width: number }> = {
  0: { stroke: '#16A34A', width: 1.5 },
  2: { stroke: '#F59E0B', dash: '5 4', width: 1.2 },
  [-2]: { stroke: '#F59E0B', dash: '5 4', width: 1.2 },
  3: { stroke: '#EF4444', dash: '2 4', width: 1 },
  [-3]: { stroke: '#EF4444', dash: '2 4', width: 1 },
};

function ageTick(days: number, span: number) {
  if (span <= 120) return `${Math.round(days / 7)}w`;
  if (span <= 800) return `${Math.round(days / 30.4375)}m`;
  const years = days / 365.25;
  return Number.isInteger(Math.round(years * 2) / 2) ? `${Math.round(years)}y` : `${(Math.round(years * 2) / 2).toFixed(1)}y`;
}

/**
 * A child's measurements over age on top of the WHO reference lines: the
 * median (green), ±2 SD (amber, the usual range is shaded between them) and
 * ±3 SD (red). Without curves (over 5, or sex unknown) only the child's line
 * is drawn.
 */
export function GrowthChart({
  points,
  curves,
  unit,
  color,
  height = 240,
}: {
  points: GrowthPoint[];
  curves: Curves | null;
  unit: string;
  color: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const left = 40;
  const right = 14;
  const top = 14;
  const bottom = 26;

  const maxDays = Math.max(...points.map((p) => p.days), ...(curves ? [curves[0].points[curves[0].points.length - 1].days] : []));
  const minDays = curves ? 0 : Math.min(...points.map((p) => p.days));
  const visibleCurveValues = curves?.flatMap((c) => c.points.filter((p) => p.days <= maxDays).map((p) => p.value)) ?? [];
  const values = [...points.map((p) => p.value), ...visibleCurveValues];
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.06;
  yMin -= pad;
  yMax += pad;

  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const x = (d: number) => (maxDays === minDays ? left + plotW / 2 : left + ((d - minDays) / (maxDays - minDays)) * plotW);
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = [0, 1, 2, 3, 4].map((i) => minDays + ((maxDays - minDays) * i) / 4);

  const band = curves
    ? (() => {
        const upper = curves.find((c) => c.z === 2)!.points;
        const lower = curves.find((c) => c.z === -2)!.points;
        return `M${upper.map((p) => `${x(p.days)},${y(p.value)}`).join(' L')} L${[...lower]
          .reverse()
          .map((p) => `${x(p.days)},${y(p.value)}`)
          .join(' L')} Z`;
      })()
    : null;

  const description = `${points.length} measurements: ${points.map((p) => `${formatValue(p.value)} ${unit}`).join(', ')}`;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityLabel={description}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band ? <Path d={band} fill="#DCFCE7" opacity={0.6} /> : null}
          {yTicks.map((t) => (
            <Line key={`g${t}`} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth={1} />
          ))}
          {curves?.map((c) => {
            const s = LINE_STYLE[c.z];
            return (
              <Polyline
                key={`z${c.z}`}
                points={c.points.map((p) => `${x(p.days)},${y(p.value)}`).join(' ')}
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
              />
            );
          })}
          {yTicks.map((t) => (
            <SvgText key={`t${t}`} x={left - 6} y={y(t) + 4} fontSize={11} fill="#64748B" textAnchor="end">
              {formatValue(Math.round(t * 10) / 10)}
            </SvgText>
          ))}
          {xTicks.map((d) => (
            <SvgText key={`x${d}`} x={x(d)} y={height - 8} fontSize={11} fill="#64748B" textAnchor="middle">
              {ageTick(d, maxDays - minDays)}
            </SvgText>
          ))}
          {points.length > 1 ? (
            <Polyline points={points.map((p) => `${x(p.days)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} />
          ) : null}
          {points.map((p) => (
            <Circle key={p.measuredAt} cx={x(p.days)} cy={y(p.value)} r={4} fill="#FFFFFF" stroke={color} strokeWidth={2.5} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
