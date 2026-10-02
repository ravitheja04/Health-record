/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import jsQR from 'jsqr';

import { cardContacts, contactFromText, dialable, emergencyText, emptyEmergencyInfo, QR_TEXT_LIMIT } from '../emergencyText';
import { qrPath } from '../qr';

const member = {
  name: 'Priya Sharma',
  dob: '1968-04-23',
  gender: 'Female',
  bloodGroup: 'O+',
  allergies: 'Penicillin, sulfa drugs',
  conditions: 'Hypertension',
  medications: '',
  emergencyContact: 'Ravi (son) +91 98765 43210',
};

/** Draws the QR path onto a pixel grid and decodes it, as a phone camera would. */
function decode(text: string) {
  const { d, count } = qrPath(text);
  const quiet = 4;
  const scale = 4;
  const size = (count + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const [col, row, len] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let c = col; c < col + len; c++)
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((row + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
  }
  return jsQR(pixels, size, size)?.data;
}

test('phone numbers are reduced to what a dialler needs', () => {
  assert.equal(dialable('+91 98765-43210'), '+919876543210');
  assert.equal(dialable('098765 43210'), '09876543210');
  assert.equal(dialable('108'), '108');
  assert.equal(dialable('call me'), null);
});

test('the old free-text contact becomes a structured contact', () => {
  assert.deepEqual(contactFromText('Ravi (son) +91 98765 43210'), { name: 'Ravi', relation: 'son', phone: '+91 98765 43210' });
  assert.deepEqual(contactFromText('Dr Mehta - 9876543210'), { name: 'Dr Mehta', relation: '', phone: '9876543210' });
  assert.deepEqual(contactFromText('Neighbour Anil'), { name: 'Neighbour Anil', relation: '', phone: '' });
  assert.equal(contactFromText('  '), null);
  const info = { ...emptyEmergencyInfo('m1'), contacts: [{ name: 'Asha', relation: 'Daughter', phone: '99999 11111' }] };
  assert.equal(cardContacts(member, info)[0].name, 'Asha'); // the card's own contacts win
  assert.equal(cardContacts(member, null)[0].name, 'Ravi');
});

test('card text has the essentials and stays within the QR limit', () => {
  const text = emergencyText(member, null, ['Telmisartan 40 mg'], '2026-10-02');
  assert.match(text, /^EMERGENCY MEDICAL INFORMATION\nName: Priya Sharma\n58 yrs, Female, Blood group O\+\nALLERGIES: Penicillin, sulfa drugs/);
  assert.match(text, /Medicines: Telmisartan 40 mg/);
  assert.match(text, /Contact: Ravi \(son\) \+91 98765 43210/);
  assert.match(emergencyText({ ...member, allergies: '' }, null, [], '2026-10-02'), /ALLERGIES: None known/);

  const long = 'x'.repeat(400);
  const info = { ...emptyEmergencyInfo('m1'), notes: long, insurer: long, doctorName: long };
  const big = emergencyText({ ...member, conditions: long, medications: long }, info, [], '2026-10-02');
  assert.ok(big.length <= QR_TEXT_LIMIT, `length ${big.length}`);
  assert.match(big, /ALLERGIES: Penicillin/); // dropped from the end, never the allergies
  assert.match(big, /Contact: Ravi/);
});

test('QR codes decode back to the same text, including Indian scripts', () => {
  const text = emergencyText(member, null, ['Telmisartan 40 mg'], '2026-10-02');
  assert.equal(decode(text), text);
  const telugu = 'Name: ప్రియ శర్మ\nALLERGIES: పెన్సిలిన్\nContact: रवि (बेटा) +91 98765 43210';
  assert.equal(decode(telugu), telugu);
});
