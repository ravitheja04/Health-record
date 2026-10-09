/// <reference types="node" />
/**
 * Runs the real family storage script (docs/family-storage.gs) in Node, with
 * small stand-ins for the Apps Script services it uses, and exposes it as a
 * `fetch` like the deployed web app.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

type FakeFile = { id: string; name: string; content: string; updated: number; trashed: boolean };

export function appsScriptWebApp() {
  let clock = Date.UTC(2026, 9, 1);
  let nextId = 1;
  const props = new Map<string, string>();
  const folders = new Map<string, { id: string; name: string; trashed: boolean; files: FakeFile[] }>();
  const iterator = <T>(items: T[]) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  const wrapFile = (f: FakeFile) => ({
    getName: () => f.name,
    getLastUpdated: () => new Date(f.updated),
    getSize: () => Buffer.byteLength(f.content),
    getBlob: () => ({ getDataAsString: () => f.content }),
    setContent: (c: string) => {
      if (c.length > 10 * 1024 * 1024) throw new Error('setContent: content larger than 10MB');
      f.content = c;
      f.updated = clock += 1000;
    },
    setTrashed: (v: boolean) => void (f.trashed = v),
  });
  const wrapFolder = (folder: { id: string; name: string; trashed: boolean; files: FakeFile[] }) => ({
    getId: () => folder.id,
    isTrashed: () => folder.trashed,
    getFiles: () => iterator(folder.files.filter((f) => !f.trashed).map(wrapFile)),
    getFilesByName: (name: string) => iterator(folder.files.filter((f) => !f.trashed && f.name === name).map(wrapFile)),
    createFile: (blob: { name: string; content: string }) => {
      const f = { id: `f${nextId++}`, name: blob.name, content: blob.content, updated: (clock += 1000), trashed: false };
      folder.files.push(f);
      return wrapFile(f);
    },
  });

  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => void props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Apps Script returns Java bytes: -128..127.
      computeDigest: (_alg: string, text: string) => [...createHash('sha256').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (content: string, _mime: string, name: string) => ({ content, name }),
    },
    DriveApp: {
      createFolder: (name: string) => {
        const folder = { id: `folder${nextId++}`, name, trashed: false, files: [] };
        folders.set(folder.id, folder);
        return wrapFolder(folder);
      },
      getFolderById: (id: string) => {
        const folder = folders.get(id);
        if (!folder) throw new Error('No item with the given ID could be found');
        return wrapFolder(folder);
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
  };
  const source = readFileSync(join(process.cwd(), 'docs/family-storage.gs'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const script = sandbox as unknown as { doPost: (e: unknown) => { text: string }; doGet: () => { text: string } };

  const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
    const out = init?.method === 'POST' ? script.doPost({ postData: { contents: String(init.body) } }) : script.doGet();
    return new Response(out.text, { status: 200 });
  };

  return {
    fetch: fetchFn as typeof fetch,
    /** Every stored file (including trashed), to inspect what Google would see. */
    allFiles: () => [...folders.values()].flatMap((f) => f.files),
    props,
  };
}
