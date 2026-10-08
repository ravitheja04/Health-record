import { File, Paths } from 'expo-file-system';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { TextItem } from '@/lib/extract/layout';
import { t } from '@/i18n';

/**
 * Reads the text of a PDF on the phone, with no internet: pdf.js runs inside a
 * hidden WebView and sends back each piece of text with its position, which
 * lib/extract turns into lab results.
 */

export type PdfReadErrorCode = 'password' | 'wrong-password' | 'unreadable' | 'timeout';

export class PdfReadError extends Error {
  constructor(
    public code: PdfReadErrorCode,
    message: string
  ) {
    super(message);
  }
}

const MAX_PAGES = 40;
/** Scanned PDFs are turned into page images for OCR; each is a few hundred KB. */
const MAX_SCAN_PAGES = 10;
const SCAN_WIDTH = 1800;

// The page only defines functions; pdf.js itself is injected once it loads, so
// its code never passes through the HTML parser.
export const PDF_READER_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
let pdfjs = null;
window.boot = async (lib, worker) => {
  try {
    const url = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    pdfjs = await import(url(lib));
    pdfjs.GlobalWorkerOptions.workerSrc = url(worker);
    post({ type: 'ready' });
  } catch (e) {
    post({ type: 'fatal', message: String((e && e.message) || e) });
  }
};
window.readPdf = async (id, base64, password, mode) => {
  let task = null;
  try {
    const raw = atob(base64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    task = pdfjs.getDocument({ data, password: password || undefined, isEvalSupported: false, disableFontFace: true, verbosity: 0 });
    const pdf = await task.promise;
    if (mode === 'images') {
      // A scanned PDF: draw each page so the phone's OCR can read it.
      const pages = [];
      for (let n = 1; n <= Math.min(pdf.numPages, ${MAX_SCAN_PAGES}); n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(4, ${SCAN_WIDTH} / base.width) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        pages.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
        page.cleanup();
      }
      post({ type: 'images', id, pages });
      return;
    }
    const items = [];
    for (let n = 1; n <= Math.min(pdf.numPages, ${MAX_PAGES}); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Same mapping as lib/extract/pdfItems.ts.
      for (const i of content.items) {
        if (typeof i.str !== 'string') continue;
        items.push({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height, page: n });
      }
    }
    post({ type: 'result', id, items });
  } catch (e) {
    const code = e && e.name === 'PasswordException' ? (e.code === 2 ? 'wrong-password' : 'password') : 'unreadable';
    post({ type: 'error', id, code, message: String((e && e.message) || e) });
  } finally {
    if (task) task.destroy();
  }
};
post({ type: 'loaded' });
</script></body></html>`;

type Reply = { items?: TextItem[]; pages?: string[] };
type Pending = { resolve: (reply: Reply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Returns `read(uri, password?)` for the PDF's text, `renderPages(uri,
 * password?)` for page images of a scanned PDF (as JPEG files), and an element
 * the screen must render. The WebView is only created when first needed.
 */
export function usePdfReader(): {
  element: ReactElement | null;
  read: (uri: string, password?: string) => Promise<TextItem[]>;
  renderPages: (uri: string, password?: string) => Promise<string[]>;
} {
  const webview = useRef<WebView>(null);
  const ready = useRef<Deferred | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const nextId = useRef(0);
  const [mounted, setMounted] = useState(false);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: { type: string; id?: string; items?: TextItem[]; pages?: string[]; code?: PdfReadErrorCode; message?: string };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'loaded') {
      // Loaded lazily so the 1.8 MB pdf.js code is only touched when a PDF is read.
      import('@/lib/extract/pdfjsSource.generated')
        .then(({ PDFJS_LIB, PDFJS_WORKER }) =>
          webview.current?.injectJavaScript(`window.boot(${JSON.stringify(PDFJS_LIB)}, ${JSON.stringify(PDFJS_WORKER)}); true;`)
        )
        .catch((e) => ready.current?.reject(new PdfReadError('unreadable', String(e))));
      return;
    }
    if (msg.type === 'ready') return ready.current?.resolve();
    if (msg.type === 'fatal') {
      ready.current?.reject(new PdfReadError('unreadable', `The PDF reader could not start: ${msg.message}`));
      ready.current = null;
      setMounted(false);
      return;
    }
    const job = msg.id ? pending.current.get(msg.id) : undefined;
    if (!job || !msg.id) return;
    pending.current.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.type === 'result' || msg.type === 'images') job.resolve({ items: msg.items, pages: msg.pages });
    else job.reject(new PdfReadError(msg.code ?? 'unreadable', msg.code === 'unreadable' ? t('Could not read this PDF. It may be damaged or not a PDF.') : (msg.message ?? '')));
  }, []);

  const run = useCallback(async (uri: string, password: string | undefined, mode: 'text' | 'images') => {
    if (!ready.current) {
      ready.current = deferred();
      setMounted(true);
    }
    await ready.current.promise;
    const base64 = await new File(uri).base64();
    const id = String(++nextId.current);
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new PdfReadError('timeout', t('Reading the PDF took too long.')));
      }, mode === 'images' ? 120_000 : 60_000);
      pending.current.set(id, { resolve, reject, timer });
      webview.current?.injectJavaScript(
        `window.readPdf(${JSON.stringify(id)}, ${JSON.stringify(base64)}, ${JSON.stringify(password ?? null)}, ${JSON.stringify(mode)}); true;`
      );
    });
  }, []);

  const read = useCallback(async (uri: string, password?: string) => (await run(uri, password, 'text')).items ?? [], [run]);

  const renderPages = useCallback(
    async (uri: string, password?: string) => {
      const { pages = [] } = await run(uri, password, 'images');
      const stamp = Date.now();
      return pages.map((data, i) => {
        const file = new File(Paths.cache, `scan-${stamp}-${i + 1}.jpg`);
        file.create({ overwrite: true });
        file.write(data, { encoding: 'base64' });
        return file.uri;
      });
    },
    [run]
  );

  const element = mounted ? (
    <View style={hidden} pointerEvents="none">
      <WebView
        ref={webview}
        source={{ html: PDF_READER_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => req.url.startsWith('https://localhost') || req.url === 'about:blank'}
      />
    </View>
  ) : null;

  return { element, read, renderPages };
}

const hidden = StyleSheet.flatten([StyleSheet.absoluteFill, { width: 1, height: 1, opacity: 0 }]);
