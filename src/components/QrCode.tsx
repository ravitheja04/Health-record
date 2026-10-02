import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { qrPath } from '@/lib/qr';

export function QrCode({ text, size = 180, label }: { text: string; size?: number; label: string }) {
  const { d, count } = useMemo(() => qrPath(text), [text]);
  const quiet = 4;
  const total = count + quiet * 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${total} ${total}`}
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
}
