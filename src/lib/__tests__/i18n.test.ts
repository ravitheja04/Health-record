/// <reference types="node" />
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { resolveLang, setLang, t, tn } from '../../i18n';
import te from '../../i18n/te';

const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();

test('Telugu translations keep every placeholder', () => {
  for (const [en, tel] of Object.entries(te)) {
    if (en === '{n}{suffix} percentile') continue; // Telugu writes "42వ", without the English suffix
    assert.deepEqual(placeholders(tel), placeholders(en), `“${en}”`);
  }
});

test('every t() text in the app has a Telugu translation', () => {
  const files = execSync("grep -rlE \"\\bt\\(|\\btn\\(\" src --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v generated | grep -v src/i18n/", {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const missing = new Set<string>();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (!(key in te)) missing.add(`${key}  (${f})`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('t() switches language, fills placeholders, and falls back to English', () => {
  try {
    setLang('te');
    assert.equal(t('Cancel'), 'రద్దు చేయండి');
    assert.equal(t('{n} days', { n: 3 }), '3 రోజులు');
    assert.equal(tn(1, '{n} day', '{n} days'), '1 రోజు');
    assert.equal(t('Not a translated sentence'), 'Not a translated sentence');
    setLang('en');
    assert.equal(t('{n} days', { n: 3 }), '3 days');
    assert.equal(t('Hello {name}', {}), 'Hello {name}');
  } finally {
    setLang('en');
  }
});

test('the language follows the phone unless one is chosen', () => {
  assert.equal(resolveLang('system', 'te'), 'te');
  assert.equal(resolveLang('system', 'hi'), 'en');
  assert.equal(resolveLang('system', null), 'en');
  assert.equal(resolveLang('en', 'te'), 'en');
  assert.equal(resolveLang('te', 'en'), 'te');
});
