import qrcodeGenerator from 'qrcode-generator';

import { utf8Bytes } from './emergencyText';

// The library encodes text as Latin-1 by default; switch it to UTF-8. It reads
// this property on its default export at encode time, so it must be set here.
// eslint-disable-next-line import/no-named-as-default-member
qrcodeGenerator.stringToBytes = utf8Bytes;

/**
 * Dark modules of a QR code as one SVG path, plus its size in modules. Each
 * horizontal run is one rectangle, which avoids hairline seams between squares.
 */
export function qrPath(text: string) {
  const qr = qrcodeGenerator(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < count && qr.isDark(r, c)) c++;
      d += `M${start} ${r}h${c - start}v1h${start - c}z`;
    }
  }
  return { d, count };
}

/** An SVG QR code markup string, for PDFs. */
export function qrSvgMarkup(text: string, size: number) {
  const { d, count } = qrPath(text);
  const quiet = 4;
  const total = count + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-quiet} ${-quiet} ${total} ${total}" shape-rendering="crispEdges"><rect x="${-quiet}" y="${-quiet}" width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
