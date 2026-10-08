/// <reference types="node" />
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { decrypt, encrypt, fromBase64, toBase64, utf8, WrongKeyError } from '../sync/crypto';
import { DriveClient, DriveError } from '../sync/drive';
import { decodeFamilyCode, encodeFamilyCode, sameKey } from '../sync/familyCode';
import { mergeDirectory, snapshotFingerprintText } from '../sync/snapshot';

const random = (n: number) => new Uint8Array(randomBytes(n));

test('encryption round-trips text and binary, and rejects the wrong family key', () => {
  const key = random(32);
  const text = 'Priya · HbA1c 6.4 % · తెలుగు ✓';
  assert.equal(utf8.decode(decrypt(key, encrypt(key, utf8.encode(text), random))), text);
  const bytes = random(70_000);
  assert.deepEqual(decrypt(key, encrypt(key, bytes, random)), bytes);
  // A fresh nonce each time: the same data never looks the same on Drive.
  assert.notEqual(encrypt(key, bytes, random), encrypt(key, bytes, random));
  assert.throws(() => decrypt(random(32), encrypt(key, bytes, random)), WrongKeyError);
  const tampered = encrypt(key, utf8.encode('hello'), random).slice(0, -4) + 'AAAA';
  assert.throws(() => decrypt(key, tampered), WrongKeyError);
  assert.throws(() => decrypt(key, 'not a sync file'), WrongKeyError);
});

test('utf8 and base64 helpers match Node', () => {
  const s = 'a€😀ఆ';
  assert.deepEqual(utf8.encode(s), new Uint8Array(Buffer.from(s, 'utf8')));
  const b = random(1000);
  assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
  assert.deepEqual(fromBase64(toBase64(b)), b);
});

test('family codes encode, survive being pasted inside a message, and reject junk', () => {
  const key = random(32);
  const code = encodeFamilyCode({ key, fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz_-123', name: 'Ravi’s phone' });
  const decoded = decodeFamilyCode(`Join our family health sync:\n${code}\nThanks!`)!;
  assert.ok(sameKey(decoded.key, key));
  assert.equal(decoded.fileId, '1AbCdEfGhIjKlMnOpQrStUvWxYz_-123');
  assert.equal(decoded.name, 'Ravi’s phone');
  assert.equal(decodeFamilyCode(encodeFamilyCode({ key, fileId: null, name: 'Amma' }))!.fileId, null);
  assert.equal(decodeFamilyCode('hello'), null);
  assert.equal(decodeFamilyCode('FHRJOIN1.bm9wZQ'), null);
  assert.equal(decodeFamilyCode(encodeFamilyCode({ key: random(16), fileId: null, name: 'x' })), null); // short key
});

test('directories add unknown family phones only', () => {
  const peers = [{ fileId: 'AAAAAAAAAAAA', name: 'Amma', lastModified: '2026-10-01' }];
  const merged = mergeDirectory(
    peers,
    [
      { fileId: 'AAAAAAAAAAAA', name: 'Amma again' },
      { fileId: 'MYFILEIDxxxx', name: 'Me' },
      { fileId: 'BBBBBBBBBBBB', name: 'Ravi' },
      { fileId: 'bad id!', name: 'Junk' },
    ],
    'MYFILEIDxxxx'
  );
  assert.deepEqual(
    merged.map((p) => [p.fileId, p.name, p.lastModified]),
    [
      ['AAAAAAAAAAAA', 'Amma', '2026-10-01'],
      ['BBBBBBBBBBBB', 'Ravi', null],
    ]
  );
});

test('the upload fingerprint ignores the timestamp', () => {
  const bundle = { format: 'family-health-registry', version: 6, exportedAt: 'x', members: [], records: [], attachments: [] } as never;
  const a = snapshotFingerprintText({ format: 'fhr-sync', version: 1, deviceName: 'P', directory: [], files: {}, bundle });
  const b = snapshotFingerprintText({ format: 'fhr-sync', version: 1, deviceName: 'P', directory: [], files: {}, bundle: { ...(bundle as object), exportedAt: 'y' } as never });
  assert.equal(a, b);
});

// ---- Drive client against a fake fetch -----------------------------------------

type Call = { url: string; init?: RequestInit };
function fakeFetch(responses: (Response | ((c: Call) => Response))[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return typeof next === 'function' ? next(call) : next;
  }) as typeof fetch;
  return { fn, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

test('Drive: creating, sharing and updating use the signed-in token', async () => {
  const { fn, calls } = fakeFetch([json({ id: 'FILE123' }), json({ id: 'perm' }), json({ id: 'FILE123' })]);
  const drive = new DriveClient({ getToken: async () => 'tok', dropToken: async () => {}, apiKey: 'KEY', fetchFn: fn });
  assert.equal(await drive.createFile('Family.enc', 'FHRSYNC1:abc', { parent: 'FOLDER', tag: 'snapshot' }), 'FILE123');
  await drive.shareByLink('FILE123');
  await drive.updateFile('FILE123', 'FHRSYNC1:def');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  assert.equal((calls[0].init!.headers as Record<string, string>).Authorization, 'Bearer tok');
  const body = String(calls[0].init!.body);
  assert.match(body, /"parents":\["FOLDER"\]/);
  assert.match(body, /"appProperties":\{"fhr":"snapshot"\}/);
  assert.match(body, /FHRSYNC1:abc/);
  assert.deepEqual(JSON.parse(String(calls[1].init!.body)), { role: 'reader', type: 'anyone', allowFileDiscovery: false });
  assert.equal(calls[2].init!.method, 'PATCH');
});

test('Drive: an expired token is dropped and the request retried once', async () => {
  const tokens = ['old', 'new'];
  const dropped: string[] = [];
  const { fn, calls } = fakeFetch([json({ error: { message: 'expired' } }, 401), json({ files: [{ id: 'F1' }] })]);
  const drive = new DriveClient({ getToken: async () => tokens.shift()!, dropToken: async (t) => void dropped.push(t), apiKey: 'K', fetchFn: fn });
  assert.equal(await drive.findOwn('snapshot'), 'F1');
  assert.deepEqual(dropped, ['old']);
  assert.equal((calls[1].init!.headers as Record<string, string>).Authorization, 'Bearer new');
  assert.match(decodeURIComponent(calls[1].url), /appProperties has \{ key='fhr' and value='snapshot' \}/);
});

test('Drive: family files are read with the API key; missing ones return null', async () => {
  const { fn, calls } = fakeFetch([json({ modifiedTime: '2026-10-02T10:00:00Z' }), new Response('FHRSYNC1:xyz'), json({}, 404)]);
  const drive = new DriveClient({ getToken: async () => null, dropToken: async () => {}, apiKey: 'K&Y', fetchFn: fn });
  assert.equal(await drive.publicModifiedTime('F1'), '2026-10-02T10:00:00Z');
  assert.equal(await drive.publicDownload('F1'), 'FHRSYNC1:xyz');
  assert.equal(await drive.publicModifiedTime('GONE'), null);
  assert.match(calls[0].url, /files\/F1\?fields=modifiedTime&key=K%26Y$/);
  assert.match(calls[1].url, /files\/F1\?alt=media&key=K%26Y$/);
  assert.equal(calls[0].init, undefined); // no Authorization header for public reads
});

test('Drive: writing without signing in explains why', async () => {
  const drive = new DriveClient({ getToken: async () => null, dropToken: async () => {}, apiKey: 'K', fetchFn: fakeFetch([]).fn });
  await assert.rejects(() => drive.updateFile('F', 'x'), (e: unknown) => e instanceof DriveError && e.status === 401);
});
