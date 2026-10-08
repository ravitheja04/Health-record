/// <reference types="node" />
/**
 * Family sync end to end with three simulated phones: the real database code
 * (on Node's built-in SQLite), the real merge and encryption, a fake Google
 * Drive, and an in-memory file system per phone.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mock, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

// ---- Native modules replaced for Node --------------------------------------------

/** Which phone's files the code is touching right now. */
let phone = 'A';
const disk = new Map<string, string>();

class FakeDirectory {
  uri: string;
  constructor(parent: FakeDirectory | string, name?: string) {
    const base = typeof parent === 'string' ? parent : parent.uri;
    this.uri = name ? `${base}/${name}` : base;
  }
  get exists() {
    return true;
  }
  create() {}
}
class FakeFile {
  uri: string;
  constructor(parent: FakeDirectory | string, name?: string) {
    const base = typeof parent === 'string' ? parent : parent.uri;
    this.uri = name ? `${base}/${name}` : base;
  }
  get exists() {
    return disk.has(this.uri);
  }
  get size() {
    return Buffer.from(disk.get(this.uri) ?? '', 'base64').length;
  }
  create() {
    disk.set(this.uri, '');
  }
  delete() {
    disk.delete(this.uri);
  }
  write(content: string) {
    disk.set(this.uri, content);
  }
  base64Sync() {
    return disk.get(this.uri) ?? '';
  }
}
mock.module('expo-file-system', {
  namedExports: {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: {
      get document() {
        return new FakeDirectory(`file:///${phone}/doc`);
      },
      get cache() {
        return new FakeDirectory(`file:///${phone}/cache`);
      },
    },
  },
});
mock.module('expo-crypto', { namedExports: { randomUUID } });
mock.module('expo-print', { namedExports: {} });
mock.module('expo-sharing', { namedExports: {} });
const keystore = new Map<string, string>();
mock.module('expo-secure-store', {
  namedExports: {
    getItemAsync: async (k: string) => keystore.get(`${phone}:${k}`) ?? null,
    setItemAsync: async (k: string, v: string) => void keystore.set(`${phone}:${k}`, v),
    deleteItemAsync: async (k: string) => void keystore.delete(`${phone}:${k}`),
  },
});

/** The parts of expo-sqlite's async API the app uses, over node:sqlite. */
function openDb() {
  const raw = new DatabaseSync(':memory:');
  const args = (params: unknown[]) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as never[];
  const db = {
    execAsync: async (sql: string) => void raw.exec(sql),
    getFirstAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).get(...args(p)) ?? null,
    getAllAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).all(...args(p)),
    runAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...args(p)),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db as never;
}

// ---- A fake Google Drive -------------------------------------------------------

type DriveFile = { owner: string; content: string; modified: number; tag?: string; isPublic: boolean };
const driveFiles = new Map<string, DriveFile>();
let clock = 0;

function driveFor(owner: string) {
  return {
    findOwn: async (tag: string) => [...driveFiles.entries()].find(([, f]) => f.owner === owner && f.tag === tag)?.[0] ?? null,
    createFolder: async (_name: string, tag: string) => {
      const id = `folder_${randomUUID().slice(0, 8)}`;
      driveFiles.set(id, { owner, content: '', modified: ++clock, tag, isPublic: false });
      return id;
    },
    createFile: async (_name: string, content: string, opts: { tag?: string } = {}) => {
      const id = `file_${randomUUID().replace(/-/g, '')}`;
      driveFiles.set(id, { owner, content, modified: ++clock, tag: opts.tag, isPublic: false });
      return id;
    },
    updateFile: async (id: string, content: string) => {
      const f = driveFiles.get(id)!;
      assert.equal(f.owner, owner, 'a phone may only write its own files');
      driveFiles.set(id, { ...f, content, modified: ++clock });
    },
    shareByLink: async (id: string) => void (driveFiles.get(id)!.isPublic = true),
    publicModifiedTime: async (id: string) => {
      const f = driveFiles.get(id);
      return f?.isPublic ? new Date(f.modified * 1000).toISOString() : null;
    },
    publicDownload: async (id: string) => {
      const f = driveFiles.get(id);
      assert.ok(f?.isPublic, 'only link-shared files can be read by others');
      return f.content;
    },
  };
}

// ---- The test ------------------------------------------------------------------

test('the main member’s Drive carries the family’s records, photos and edits to every phone', async () => {
  const DB = await import('../db');
  const { runSync } = await import('../sync/engine');
  const { getSyncState, saveSyncState, setFamilyKey } = await import('../sync/state');
  const Vitals = await import('../vitals');
  const random = (n: number) => new Uint8Array(randomBytes(n));
  const sha256 = async (t: string) => createHash('sha256').update(t).digest('hex');
  const familyKey = random(32);

  const phones: Record<string, ReturnType<typeof openDb>> = {};
  async function setUp(name: string, role: 'owner' | 'member', peers: string[]) {
    phone = name;
    const db = openDb();
    await DB.migrateDbIfNeeded(db);
    await setFamilyKey(familyKey);
    await saveSyncState(db, { role, deviceName: `${name} phone`, peers: peers.map((fileId) => ({ fileId, name: '?', lastModified: null })) });
    phones[name] = db;
    return db;
  }
  async function sync(name: string, { key = familyKey, signedIn = true } = {}) {
    phone = name;
    return runSync({ db: phones[name], drive: driveFor(name) as never, key, random, sha256, canUpload: signedIn });
  }

  // A is the main member's phone: a member, a lab record with a photo, and a vital.
  const now = '2026-10-01T10:00:00.000Z';
  const a = await setUp('A', 'owner', []);
  await DB.upsertMember(a, {
    id: 'm1', name: 'Priya Sharma', relation: 'Parent', dob: '1968-04-23', gender: 'Female', bloodGroup: 'O+',
    allergies: '', conditions: '', medications: '', emergencyContact: '', notes: '', color: '#2563EB', createdAt: now, updatedAt: now,
  });
  await DB.upsertRecord(a, { id: 'r1', memberId: 'm1', type: 'lab', title: 'Lipid profile', date: '2026-09-12', doctor: '', facility: 'Apollo', notes: '', createdAt: now, updatedAt: now });
  const photo = Buffer.from(randomBytes(5000)).toString('base64');
  disk.set('file:///A/doc/attachments/att1.jpg', photo);
  await DB.insertAttachment(a, { id: 'att1', recordId: 'r1', name: 'report.jpg', mimeType: 'image/jpeg', fileName: 'att1.jpg', size: 5000, createdAt: now });
  await Vitals.upsertVital(a, { id: 'v1', memberId: 'm1', type: 'bp', value: 132, value2: 86, context: '', measuredAt: '2026-10-01T08:00', notes: '', createdAt: now, updatedAt: now });

  const first = await sync('A');
  assert.equal(first.uploaded, true);
  assert.equal(first.filesUploaded, 1);
  const aFile = (await getSyncState(a)).myFileId!;
  assert.ok(aFile);
  // Everything on Drive is encrypted.
  for (const f of driveFiles.values()) if (f.content) assert.ok(!f.content.includes('Priya') && f.content.startsWith('FHRSYNC1:'));

  // B joined with A's code and signed in with Google: it gets everything and sends its own copy.
  const b = await setUp('B', 'member', [aFile]);
  const fromA = await sync('B');
  assert.deepEqual(fromA.problems, []);
  assert.equal(fromA.filesReceived, 1);
  assert.equal(fromA.uploaded, true);
  assert.equal(((await DB.getMember(b, 'm1')) as { name: string }).name, 'Priya Sharma');
  assert.equal(disk.get('file:///B/doc/attachments/att1.jpg'), photo);
  assert.equal(((await Vitals.getVital(b, 'v1')) as { value: number }).value, 132);
  const bFile = (await getSyncState(b)).myFileId!;
  assert.equal((await getSyncState(b)).peers[0].knowsMe, false);

  // C joined with A's code and never signs in to Google: it still gets everything, and uploads nothing.
  const c = await setUp('C', 'member', [aFile]);
  const fromA2 = await sync('C', { signedIn: false });
  assert.deepEqual(fromA2.problems, []);
  assert.equal(fromA2.uploaded, false);
  assert.equal((await getSyncState(c)).myFileId, null);
  assert.equal(((await DB.getRecord(c, 'r1')) as { title: string }).title, 'Lipid profile');
  assert.equal(disk.get('file:///C/doc/attachments/att1.jpg'), photo);
  assert.ok(![...driveFiles.values()].some((f) => f.owner === 'C'), 'C has no Drive files');

  // An unchanged phone doesn't upload again (after the round that adds its own file to its directory).
  await sync('A');
  assert.equal((await sync('A')).uploaded, false);

  // A scans B's code, so A collects B's changes; B sees it's connected.
  phone = 'A';
  await saveSyncState(a, { peers: [{ fileId: bFile, name: '?', lastModified: null }] });
  assert.deepEqual((await sync('A')).problems, []);
  await sync('B');
  assert.equal((await getSyncState(b)).peers[0].knowsMe, true);
  // Members only ever read the main member's copy, not each other's.
  assert.deepEqual((await getSyncState(b)).peers.map((p) => p.fileId), [aFile]);

  // An edit on B reaches A, and through A's Drive reaches C.
  phone = 'B';
  await Vitals.upsertVital(b, { id: 'v1', memberId: 'm1', type: 'bp', value: 124, value2: 80, context: '', measuredAt: '2026-10-01T08:00', notes: 'rechecked', createdAt: now, updatedAt: '2026-10-02T09:00:00.000Z' });
  assert.equal((await sync('B')).uploaded, true);
  const fromB = await sync('A');
  assert.deepEqual(fromB.problems, []);
  assert.equal(fromB.uploaded, true);
  assert.equal(((await Vitals.getVital(a, 'v1')) as { notes: string }).notes, 'rechecked');
  await sync('C', { signedIn: false });
  assert.equal(((await Vitals.getVital(c, 'v1')) as { value: number; notes: string }).notes, 'rechecked');

  // The main member's phone signed out of Google: it says why others stop getting updates.
  assert.match((await sync('A', { signedIn: false })).problems.join(' '), /Sign in with Google/);

  // A phone with a different family key can't read the family's files.
  const d = await setUp('D', 'member', [aFile]);
  const outsider = await sync('D', { key: random(32) });
  assert.match(outsider.problems.join(' '), /different family code/);
  assert.equal(await DB.getMember(d, 'm1'), null);
});
