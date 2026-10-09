import { toBase64 } from './crypto';
import { t } from '../../i18n';

/**
 * Talks to the family storage: the small Apps Script web app the main family
 * member runs in their own Google account (docs/family-storage.gs). It keeps
 * the family's encrypted sync files in their Drive. Every phone with the
 * family code can list, read and write them; nobody signs in.
 */

export class StoreError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export type StoredFile = { name: string; modified: string; size: number };

type Fetch = typeof fetch;

const URL_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

/** The deployed web app link ("…/exec"), tidied from what was pasted; null if it isn't one. */
export function cleanStoreUrl(text: string): string | null {
  const m = /https:\/\/script\.google\.com\/\S+?\/exec\b/.exec(text.trim());
  if (!m) return null;
  return URL_PATTERN.test(m[0]) ? m[0] : null;
}

/** What phones send to prove they have the family code, without sending the code itself. */
export async function storeToken(key: Uint8Array, sha256: (text: string) => Promise<string>) {
  return sha256(`fhr-store:${toBase64(key)}`);
}

function messageFor(error: unknown) {
  switch (error) {
    case 'unauthorized':
      return t('This family storage belongs to a different family code.');
    case 'not-set-up':
      return t('The family storage isn’t connected yet. The main family member needs to finish setting it up.');
    case 'not-found':
      return t('A family file is missing from the storage.');
    default:
      return t('The family storage refused the request ({error}).', { error: String(error) });
  }
}

export class StoreClient {
  private fetchFn: Fetch;

  constructor(
    private url: string,
    private token: string,
    fetchFn?: Fetch
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  private async call<T>(op: string, extra: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: 'POST',
        // text/plain keeps Apps Script happy; it reads the body as JSON itself.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ op, token: this.token, ...extra }),
      });
    } catch {
      throw new StoreError('offline', t('Couldn’t reach the family storage. Check the internet connection.'));
    }
    const text = await res.text();
    let data: { ok?: boolean; error?: unknown } & Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new StoreError(
        'not-store',
        res.ok
          ? t('That link didn’t answer like the family storage script. Check that it’s the Web app link and that “Who has access” is set to Anyone.')
          : t('The family storage didn’t answer ({status}). Try again later.', { status: res.status })
      );
    }
    if (!data.ok) throw new StoreError(String(data.error), messageFor(data.error));
    return data as T;
  }

  /** Connects; the first phone to connect claims an unused storage for its family. */
  async hello() {
    await this.call('hello');
  }

  async list(): Promise<StoredFile[]> {
    return (await this.call<{ files: StoredFile[] }>('list')).files;
  }

  /** The file's text, or null when it isn't there. */
  async get(name: string): Promise<string | null> {
    try {
      return (await this.call<{ content: string }>('get', { name })).content;
    } catch (e) {
      if (e instanceof StoreError && e.code === 'not-found') return null;
      throw e;
    }
  }

  async put(name: string, content: string) {
    await this.call('put', { name, content });
  }
}
