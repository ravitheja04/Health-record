import type { TextItem } from '@/lib/extract/layout';
import { ocrToItems, type OcrResult } from '@/lib/extract/ocr';
import { t } from '@/i18n';

/**
 * Reads text from photos (or scanned PDF pages) on the phone with Google ML
 * Kit's offline text recognition. The native module is only in the installed
 * app, not in Expo Go, so it is loaded when first needed.
 */

export class OcrUnavailableError extends Error {}

type MlKit = { recognizeText: (imagePath: string) => Promise<OcrResult> };
let mlkit: Promise<MlKit> | null = null;

function loadMlKit() {
  mlkit ??= import('@infinitered/react-native-mlkit-text-recognition').catch(() => {
    mlkit = null;
    throw new OcrUnavailableError(t('Reading photos needs the installed app; it does not work in Expo Go.'));
  });
  return mlkit;
}

/** Each image is one page of the report, in order. */
export async function recognizeImages(uris: string[]): Promise<TextItem[]> {
  const { recognizeText } = await loadMlKit();
  const items: TextItem[] = [];
  for (const [i, uri] of uris.entries()) items.push(...ocrToItems(await recognizeText(uri), i + 1));
  return items;
}
