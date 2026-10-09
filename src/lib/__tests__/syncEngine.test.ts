/// <reference types="node" />
/**
 * Family sync end to end with three simulated phones: the real database code
 * (on Node's built-in SQLite), the real merge and encryption, the real
 * family storage script (run in Node), and an in-memory file system per phone.
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

// ---- The test ------------------------------------------------------------------

test('family phones share records, photos and edits through the main member’s storage script', async () => {
  const { appsScriptWebApp } = await import('./fixtures/appsScript');
  const DB = await import('../db');
  const { runSync } = await import('../sync/engine');
  const { getSyncState, saveSyncState, setFamilyKey } = await import('../sync/state');
  const { StoreClient, storeToken } = await import('../sync/store');
  const Vitals = await import('../vitals');
  const random = (n: number) => new Uint8Array(randomBytes(n));
  const sha256 = async (t: string) => createHash('sha256').update(t).digest('hex');
  const familyKey = random(32);
  const app = appsScriptWebApp();
  const URL = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefghijklmnopqrstuvwxyz/exec';
  const storeWith = async (key: Uint8Array) => new StoreClient(URL, await storeToken(key, sha256), app.fetch);

  const phones: Record<string, ReturnType<typeof openDb>> = {};
  async function setUp(name: string) {
    phone = name;
    const db = openDb();
    await DB.migrateDbIfNeeded(db);
    await setFamilyKey(familyKey);
    await saveSyncState(db, { url: URL, deviceId: `dev${name}xyz`, deviceName: `${name} phone` });
    phones[name] = db;
    return db;
  }
  async function sync(name: string, key = familyKey) {
    phone = name;
    return runSync({ db: phones[name], store: await storeWith(key), key, random, sha256 });
  }

  // The main member's phone connects the storage, and has a member, a lab record with a photo, and a vital.
  await (await storeWith(familyKey)).hello();
  const now = '2026-10-01T10:00:00.000Z';
  const a = await setUp('A');
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
  assert.deepEqual(first.problems, []);
  assert.equal(first.uploaded, true);
  assert.equal(first.filesUploaded, 1);
  // Everything in the storage is encrypted.
  for (const f of app.allFiles()) assert.ok(!f.content.includes('Priya') && f.content.startsWith('FHRSYNC1:'), f.name);

  // B joins with the family code: it gets A's records and photo, and sends its own copy.
  const b = await setUp('B');
  const fromA = await sync('B');
  assert.deepEqual(fromA.problems, []);
  assert.equal(fromA.filesReceived, 1);
  assert.equal(fromA.uploaded, true);
  assert.equal(((await DB.getMember(b, 'm1')) as { name: string }).name, 'Priya Sharma');
  assert.equal(disk.get('file:///B/doc/attachments/att1.jpg'), photo);
  assert.equal(((await Vitals.getVital(b, 'v1')) as { value: number }).value, 132);

  // B adds a record with a photo; C joins later and gets everything from both.
  phone = 'B';
  await DB.upsertRecord(b, { id: 'r2', memberId: 'm1', type: 'prescription', title: 'Cardiology visit', date: '2026-10-02', doctor: 'Dr Rao', facility: '', notes: '', createdAt: now, updatedAt: now });
  const scan = Buffer.from(randomBytes(3000)).toString('base64');
  disk.set('file:///B/doc/attachments/att2.jpg', scan);
  await DB.insertAttachment(b, { id: 'att2', recordId: 'r2', name: 'rx.jpg', mimeType: 'image/jpeg', fileName: 'att2.jpg', size: 3000, createdAt: now });
  assert.equal((await sync('B')).filesUploaded, 1);
  const c = await setUp('C');
  const fromAll = await sync('C');
  assert.deepEqual(fromAll.problems, []);
  assert.equal(fromAll.filesReceived, 2);
  assert.equal(((await DB.getRecord(c, 'r2')) as { title: string }).title, 'Cardiology visit');
  assert.equal(disk.get('file:///C/doc/attachments/att2.jpg'), scan);
  assert.deepEqual((await getSyncState(c)).phones.map((p) => p.name).sort(), ['A phone', 'B phone']);

  // A gets B's record; an unchanged phone then doesn't upload or download again.
  await sync('A');
  assert.equal(((await DB.getRecord(a, 'r2')) as { doctor: string }).doctor, 'Dr Rao');
  const quiet = await sync('A');
  assert.equal(quiet.uploaded, false);
  assert.ok(quiet.received.every((r) => !r.changed));

  // An edit on C reaches A and B.
  phone = 'C';
  await Vitals.upsertVital(c, { id: 'v1', memberId: 'm1', type: 'bp', value: 124, value2: 80, context: '', measuredAt: '2026-10-01T08:00', notes: 'rechecked', createdAt: now, updatedAt: '2026-10-02T09:00:00.000Z' });
  assert.equal((await sync('C')).uploaded, true);
  await sync('A');
  await sync('B');
  assert.equal(((await Vitals.getVital(a, 'v1')) as { notes: string }).notes, 'rechecked');
  assert.equal(((await Vitals.getVital(b, 'v1')) as { value: number }).value, 124);

  // A phone with a different family key is refused by the storage.
  const d = await setUp('D');
  const outsider = await sync('D', random(32));
  assert.match(outsider.problems.join(' '), /different family code/);
  assert.equal(await DB.getMember(d, 'm1'), null);
});
