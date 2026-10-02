import { t } from '../../i18n';

/**
 * The few Google Drive v3 calls family sync needs.
 *
 * Writing uses the signed-in user's token with the `drive.file` permission,
 * which only reaches files this app created. Reading family members' files
 * uses the app's API key, because those files are shared by link (and are
 * encrypted, so the link alone reveals nothing).
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export type DriveClientOptions = {
  /** Current OAuth access token for writing; null when not signed in. */
  getToken: () => Promise<string | null>;
  /** Called when a token was rejected, so the next getToken() returns a fresh one. */
  dropToken: (token: string) => Promise<void>;
  apiKey: string;
  fetchFn?: Fetch;
};

async function failure(res: Response, what: string) {
  let detail = '';
  try {
    detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    // No JSON body.
  }
  return new DriveError(res.status, `${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
}

export class DriveClient {
  private fetchFn: Fetch;

  constructor(private opts: DriveClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** An authorised request, retried once with a fresh token if the old one expired. */
  private async authed(url: string, init: RequestInit, what: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.opts.getToken();
      if (!token) throw new DriveError(401, t('Sign in with Google to share this phone’s records.'));
      const res = await this.fetchFn(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) {
        await this.opts.dropToken(token);
        continue;
      }
      if (!res.ok) throw await failure(res, what);
      return res;
    }
    throw new DriveError(401, t('Google sign-in expired. Sign in again.'));
  }

  /** Finds a file this app made, tagged with `appProperties.fhr = tag`. */
  async findOwn(tag: string): Promise<string | null> {
    const q = encodeURIComponent(`appProperties has { key='fhr' and value='${tag}' } and trashed=false`);
    const res = await this.authed(`${API}/files?q=${q}&spaces=drive&fields=files(id)&pageSize=1`, { method: 'GET' }, 'Looking for the sync file');
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  }

  async createFolder(name: string, tag: string): Promise<string> {
    const res = await this.authed(
      `${API}/files?fields=id`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { fhr: tag } }) },
      'Creating the Drive folder'
    );
    return ((await res.json()) as { id: string }).id;
  }

  async createFile(name: string, text: string, opts: { parent?: string; tag?: string } = {}): Promise<string> {
    const boundary = `fhr${Date.now().toString(36)}`;
    const meta = { name, mimeType: 'text/plain', ...(opts.parent ? { parents: [opts.parent] } : {}), ...(opts.tag ? { appProperties: { fhr: opts.tag } } : {}) };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await this.authed(
      `${UPLOAD}/files?uploadType=multipart&fields=id`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
      'Uploading'
    );
    return ((await res.json()) as { id: string }).id;
  }

  async updateFile(id: string, text: string) {
    await this.authed(`${UPLOAD}/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'text/plain' }, body: text }, 'Uploading');
  }

  /** "Anyone with the link can view": how family phones (and nobody else, without the key) read it. */
  async shareByLink(id: string) {
    await this.authed(
      `${API}/files/${id}/permissions?fields=id`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }) },
      'Sharing'
    );
  }

  /** Last change time of a family member's file; null when it no longer exists. */
  async publicModifiedTime(id: string): Promise<string | null> {
    const res = await this.fetchFn(`${API}/files/${id}?fields=modifiedTime&key=${encodeURIComponent(this.opts.apiKey)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res, 'Checking for family updates');
    return ((await res.json()) as { modifiedTime: string }).modifiedTime;
  }

  async publicDownload(id: string): Promise<string> {
    const res = await this.fetchFn(`${API}/files/${id}?alt=media&key=${encodeURIComponent(this.opts.apiKey)}`);
    if (!res.ok) throw await failure(res, 'Downloading family records');
    return res.text();
  }
}
