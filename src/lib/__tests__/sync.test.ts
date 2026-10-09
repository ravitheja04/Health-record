/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { decrypt, encrypt, fromBase64, toBase64, utf8, WrongKeyError } from '../sync/crypto';
import { readFileSync } from 'node:fs';

import { decodeFamilyCode, encodeFamilyCode, sameKey } from '../sync/familyCode';
import { FAMILY_SCRIPT } from '../sync/script';
import { isPhoneFile, snapshotFingerprintText } from '../sync/snapshot';
import { cleanStoreUrl, StoreClient, StoreError, storeToken } from '../sync/store';
import { appsScriptWebApp } from './fixtures/appsScript';

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

const URL = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefghijklmnopqrstuvwxyzABCDEF/exec';
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');

test('family codes carry the key and storage link, survive being pasted inside a message, and reject junk', () => {
  const key = random(32);
  const code = encodeFamilyCode({ key, url: URL, name: 'Ravi’s phone' });
  const decoded = decodeFamilyCode(`Join our family health sync:\n${code}\nThanks!`)!;
  assert.ok(sameKey(decoded.key, key));
  assert.equal(decoded.url, URL);
  assert.equal(decoded.name, 'Ravi’s phone');
  assert.equal(decodeFamilyCode('hello'), null);
  assert.equal(decodeFamilyCode('FHRJOIN2.bm9wZQ'), null);
  assert.equal(decodeFamilyCode(encodeFamilyCode({ key: random(16), url: URL, name: 'x' })), null); // short key
  assert.equal(decodeFamilyCode(encodeFamilyCode({ key, url: 'https://evil.example/exec', name: 'x' })), null);
});

test('storage links are recognised in what people paste', () => {
  assert.equal(cleanStoreUrl(`  ${URL}  `), URL);
  assert.equal(cleanStoreUrl(`Web app URL: ${URL}?x=1`), URL);
  const workspace = 'https://script.google.com/a/example.com/macros/s/AKfycbx1234567890abcdefghijklmnop/exec';
  assert.equal(cleanStoreUrl(workspace), workspace);
  assert.equal(cleanStoreUrl('https://script.google.com/macros/s/AKfycbx1234567890abcdefghijklmnop/dev'), null);
  assert.equal(cleanStoreUrl('https://example.com/macros/s/AKfycbx1234567890abcdefghijklmnop/exec'), null);
});

test('the app carries exactly the published storage script', () => {
  assert.equal(FAMILY_SCRIPT, readFileSync('docs/family-storage.gs', 'utf8'));
});

test('the upload fingerprint ignores timestamps; phone files are recognised', () => {
  const bundle = { format: 'family-health-registry', version: 6, exportedAt: 'x', members: [], records: [], attachments: [] } as never;
  const a = snapshotFingerprintText({ format: 'fhr-sync', version: 2, deviceName: 'P', bundle });
  const b = snapshotFingerprintText({ format: 'fhr-sync', version: 2, deviceName: 'P', bundle: { ...(bundle as object), exportedAt: 'y' } as never });
  assert.equal(a, b);
  assert.ok(isPhoneFile('phone-AbC123_-xyz.enc'));
  assert.ok(!isPhoneFile('file-123.enc'));
  assert.ok(!isPhoneFile('phone-../x.enc'));
});

test('storage script: the first phone claims it, the family shares it, others are refused', async () => {
  const app = appsScriptWebApp();
  const familyKey = random(32);
  const store = new StoreClient(URL, await storeToken(familyKey, sha256), app.fetch);

  // Nothing works before the main family member connects.
  await assert.rejects(store.list(), (e: unknown) => e instanceof StoreError && e.code === 'not-set-up');
  await store.hello();
  assert.deepEqual(await store.list(), []);

  await store.put('phone-abcdef.enc', 'FHRSYNC1:aaa');
  await store.put('phone-abcdef.enc', 'FHRSYNC1:bbb');
  assert.equal(await store.get('phone-abcdef.enc'), 'FHRSYNC1:bbb');
  assert.equal(await store.get('phone-other1.enc'), null);
  assert.deepEqual((await store.list()).map((f) => f.name), ['phone-abcdef.enc']);

  // A second phone with the same family code uses the same storage.
  const sameFamily = new StoreClient(URL, await storeToken(familyKey, sha256), app.fetch);
  await sameFamily.hello();
  assert.equal(await sameFamily.get('phone-abcdef.enc'), 'FHRSYNC1:bbb');

  // A different family can't claim or read it.
  const stranger = new StoreClient(URL, await storeToken(random(32), sha256), app.fetch);
  await assert.rejects(stranger.hello(), (e: unknown) => e instanceof StoreError && e.code === 'unauthorized');
  await assert.rejects(stranger.get('phone-abcdef.enc'), /different family code/);

  // Names can't escape the folder; large files are replaced instead of overwritten.
  await assert.rejects(store.put('../secret', 'x'), (e: unknown) => e instanceof StoreError && e.code === 'bad-name');
  const big = 'x'.repeat(10 * 1024 * 1024);
  await store.put('file-big.enc', 'small');
  await store.put('file-big.enc', big);
  assert.equal((await store.get('file-big.enc'))!.length, big.length);
  assert.equal((await store.list()).filter((f) => f.name === 'file-big.enc').length, 1);
});

test('storage link problems are explained', async () => {
  const html = (async () => new Response('<html>Sign in</html>', { status: 200 })) as typeof fetch;
  await assert.rejects(new StoreClient(URL, 'x'.repeat(64), html).hello(), /Who has access/);
  const down = (async () => new Response('Service unavailable', { status: 503 })) as typeof fetch;
  await assert.rejects(new StoreClient(URL, 'x'.repeat(64), down).hello(), /503/);
  const offline = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof fetch;
  await assert.rejects(new StoreClient(URL, 'x'.repeat(64), offline).list(), /internet connection/);
});
