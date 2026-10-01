import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { dateToMs, formatValue, statusOf } from '@/lib/labAnalysis';

export const labColors = {
  out: '#C2410C',
  outSoft: '#FFEDD5',
  outText: '#9A3412',
  toward: '#1D4ED8',
  towardSoft: '#DBEAFE',
  line: '#2563EB',
  neutral: '#475569',
  band: '#DCFCE7',
  bandText: '#166534',
  grid: '#E2E8F0',
};

/** A tiny trend line for list rows. */
export function Sparkline({ values, color = labColors.neutral, width = 60, height = 24 }: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </Svg>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(date: string) {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

type ChartPoint = { date: string; value: number };

/**
 * Values over time on a true time axis, with the report's normal range shaded.
 * Points outside the range are drawn in orange.
 */
export function TrendChart({ points, refLow, refHigh, unit, height = 210 }: {
  points: ChartPoint[];
  refLow: number | null;
  refHigh: number | null;
  unit: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const left = 40;
  const right = 18;
  const top = 22;
  const bottom = 28;

  const values = points.map((p) => p.value);
  const bounds = [...values, ...(refLow !== null ? [refLow] : []), ...(refHigh !== null ? [refHigh] : [])];
  let yMin = Math.min(...bounds);
  let yMax = Math.max(...bounds);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;

  const times = points.map((p) => dateToMs(p.date));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const x = (t: number) => (tMax === tMin ? left + plotW / 2 : left + ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const bandTop = refHigh !== null ? y(Math.min(refHigh, yMax)) : top;
  const bandBottom = refLow !== null ? y(Math.max(refLow, yMin)) : top + plotH;
  const showValues = points.length <= 8;
  const labelIdx = new Set([0, points.length - 1, Math.floor((points.length - 1) / 2)]);

  const description = `${points.length} results from ${points[0]?.date} to ${points[points.length - 1]?.date}: ${points
    .map((p) => `${formatValue(p.value)} ${unit}`)
    .join(', ')}`;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height }}
      accessible
      accessibilityLabel={description}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {refLow !== null || refHigh !== null ? (
            <Rect x={left} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} fill={labColors.band} />
          ) : null}
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={labColors.grid} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={left - 6} y={y(t) + 4} fontSize={11} fill="#64748B" textAnchor="end">
              {formatValue(t)}
            </SvgText>
          ))}
          {points.length > 1 ? (
            <Polyline
              points={points.map((p, i) => `${x(times[i])},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={labColors.line}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((p, i) => {
            const out = statusOf(p.value, refLow, refHigh);
            const color = out === 'high' || out === 'low' ? labColors.out : labColors.line;
            const isLast = i === points.length - 1;
            return (
              <Circle
                key={`p${i}`}
                cx={x(times[i])}
                cy={y(p.value)}
                r={isLast ? 5.5 : 4}
                fill={isLast ? color : '#FFFFFF'}
                stroke={color}
                strokeWidth={2}
              />
            );
          })}
          {showValues
            ? points.map((p, i) => (
                <SvgText
                  key={`v${i}`}
                  x={x(times[i])}
                  y={y(p.value) - 10}
                  fontSize={11}
                  fontWeight="600"
                  fill="#334155"
                  textAnchor="middle">
                  {formatValue(p.value)}
                </SvgText>
              ))
            : null}
          {points.map((p, i) =>
            labelIdx.has(i) ? (
              <SvgText
                key={`x${i}`}
                x={x(times[i])}
                y={height - 8}
                fontSize={11}
                fill="#64748B"
                textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {shortDate(p.date)}
              </SvgText>
            ) : null
          )}
        </Svg>
      ) : null}
    </View>
  );
}
