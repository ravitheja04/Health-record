import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { dateToMs, formatValue, statusOf } from '@/lib/labAnalysis';

import { colors } from './ui';

/** Chart and status colours; getters so they follow the light/dark theme. */
export const labColors = {
  get out() {
    return colors.warnStrong;
  },
  get outSoft() {
    return colors.warnBg;
  },
  get outText() {
    return colors.warnText;
  },
  get toward() {
    return colors.infoText;
  },
  get towardSoft() {
    return colors.infoBg;
  },
  get line() {
    return colors.primary;
  },
  get neutral() {
    return colors.muted;
  },
  get band() {
    return colors.okBg;
  },
  get bandText() {
    return colors.okText;
  },
  get grid() {
    return colors.border;
  },
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

/** "Mar 26" for ranges over a few months, "12 Mar" for shorter ones. */
export function shortTimeLabel(t: number, spanMs: number) {
  const d = new Date(t);
  return spanMs > 120 * 86400000 ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export type TimePoint = { t: number; value: number; value2?: number | null };

type Band = { low: number | null; high: number | null } | null;

/**
 * Values over time on a true time axis. A shaded band marks the normal range,
 * dashed lines mark reference values, and an optional second series (the
 * bottom blood pressure number) is drawn as its own line.
 */
export function TimeChart({
  points,
  band = null,
  refLines = [],
  unit,
  height = 210,
  xLabel,
  isOut,
  color = labColors.line,
  color2 = '#EA580C',
}: {
  points: TimePoint[];
  band?: Band;
  refLines?: number[];
  unit: string;
  height?: number;
  xLabel: (t: number) => string;
  isOut?: (p: TimePoint) => boolean;
  color?: string;
  color2?: string;
}) {
  const [width, setWidth] = useState(0);
  const left = 40;
  const right = 18;
  const top = 22;
  const bottom = 28;

  const values = points.flatMap((p) => (p.value2 === undefined || p.value2 === null ? [p.value] : [p.value, p.value2]));
  const bounds = [...values, ...refLines, ...(band?.low != null ? [band.low] : []), ...(band?.high != null ? [band.high] : [])];
  let yMin = Math.min(...bounds);
  let yMax = Math.max(...bounds);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;

  const times = points.map((p) => p.t);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const x = (t: number) => (tMax === tMin ? left + plotW / 2 : left + ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const hasBand = !!band && (band.low !== null || band.high !== null);
  const bandTop = band?.high != null ? y(Math.min(band.high, yMax)) : top;
  const bandBottom = band?.low != null ? y(Math.max(band.low, yMin)) : top + plotH;
  const showValues = points.length <= 8;
  const labelIdx = new Set([0, points.length - 1, Math.floor((points.length - 1) / 2)]);
  const second = points.filter((p) => p.value2 !== undefined && p.value2 !== null);

  const description = `${points.length} readings: ${points
    .map((p) => `${formatValue(p.value)}${p.value2 != null ? `/${formatValue(p.value2)}` : ''} ${unit}`)
    .join(', ')}`;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityLabel={description}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {hasBand ? <Rect x={left} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} fill={labColors.band} /> : null}
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={labColors.grid} strokeWidth={1} />
          ))}
          {refLines.map((r) => (
            <Line key={`r${r}`} x1={left} x2={left + plotW} y1={y(r)} y2={y(r)} stroke={colors.placeholder} strokeWidth={1} strokeDasharray="4 4" />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={left - 6} y={y(t) + 4} fontSize={11} fill={colors.muted} textAnchor="end">
              {formatValue(t)}
            </SvgText>
          ))}
          {points.length > 1 ? (
            <Polyline
              points={points.map((p) => `${x(p.t)},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {second.length > 1 ? (
            <Polyline
              points={second.map((p) => `${x(p.t)},${y(p.value2!)}`).join(' ')}
              fill="none"
              stroke={color2}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((p, i) => {
            const out = isOut?.(p) ?? false;
            const c = out ? labColors.out : color;
            const last = i === points.length - 1;
            return (
              <Circle key={`p${i}`} cx={x(p.t)} cy={y(p.value)} r={last ? 5.5 : 4} fill={last ? c : colors.card} stroke={c} strokeWidth={2} />
            );
          })}
          {second.map((p, i) => (
            <Circle key={`q${i}`} cx={x(p.t)} cy={y(p.value2!)} r={3.5} fill={colors.card} stroke={color2} strokeWidth={2} />
          ))}
          {showValues
            ? points.map((p, i) => (
                <SvgText key={`v${i}`} x={x(p.t)} y={y(p.value) - 10} fontSize={11} fontWeight="600" fill={colors.label} textAnchor="middle">
                  {formatValue(p.value)}
                </SvgText>
              ))
            : null}
          {points.map((p, i) =>
            labelIdx.has(i) ? (
              <SvgText
                key={`x${i}`}
                x={x(p.t)}
                y={height - 8}
                fontSize={11}
                fill={colors.muted}
                textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {xLabel(p.t)}
              </SvgText>
            ) : null
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** Lab results over time with the report's normal range shaded; out-of-range points in orange. */
export function TrendChart({ points, refLow, refHigh, unit, height = 210 }: {
  points: { date: string; value: number }[];
  refLow: number | null;
  refHigh: number | null;
  unit: string;
  height?: number;
}) {
  const byT = new Map(points.map((p) => [dateToMs(p.date), p.date]));
  return (
    <TimeChart
      points={points.map((p) => ({ t: dateToMs(p.date), value: p.value }))}
      band={{ low: refLow, high: refHigh }}
      unit={unit}
      height={height}
      xLabel={(t) => shortDate(byT.get(t) ?? '')}
      isOut={(p) => {
        const s = statusOf(p.value, refLow, refHigh);
        return s === 'high' || s === 'low';
      }}
    />
  );
}
