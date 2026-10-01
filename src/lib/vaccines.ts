import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertRecord } from './db';
import { todayIso } from './format';
import type { MedicalRecord, Vaccination } from './types';

export type VaccinationWithMember = Vaccination & { memberName: string; memberColor: string };

export function listVaccinations(db: SQLiteDatabase, memberId?: string) {
  return db.getAllAsync<VaccinationWithMember>(
    `SELECT v.*, m.name AS memberName, m.color AS memberColor
     FROM vaccinations v JOIN members m ON m.id = v.memberId
     ${memberId ? 'WHERE v.memberId = ?' : ''}
     ORDER BY m.createdAt ASC, v.dueDate ASC`,
    ...(memberId ? [memberId] : [])
  );
}

export function getVaccination(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Vaccination>('SELECT * FROM vaccinations WHERE id = ?', id);
}

export async function upsertVaccination(db: SQLiteDatabase, v: Vaccination) {
  await db.runAsync(
    `INSERT INTO vaccinations (id, memberId, name, dose, dueDate, givenDate, facility, notes, recordId, scheduleKey, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       memberId = excluded.memberId, name = excluded.name, dose = excluded.dose, dueDate = excluded.dueDate,
       givenDate = excluded.givenDate, facility = excluded.facility, notes = excluded.notes,
       recordId = excluded.recordId, scheduleKey = excluded.scheduleKey, updatedAt = excluded.updatedAt`,
    v.id, v.memberId, v.name, v.dose, v.dueDate, v.givenDate, v.facility, v.notes, v.recordId, v.scheduleKey,
    v.createdAt, v.updatedAt
  );
}

export async function deleteVaccination(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM vaccinations WHERE id = ?', id);
}

export async function setGivenDate(db: SQLiteDatabase, id: string, givenDate: string | null) {
  await db.runAsync('UPDATE vaccinations SET givenDate = ?, updatedAt = ? WHERE id = ?', givenDate, new Date().toISOString(), id);
}

/** Adds planned doses from a schedule in one go. */
export async function addPlannedDoses(
  db: SQLiteDatabase,
  memberId: string,
  planned: { scheduleKey: string; name: string; dose: string; dueDate: string }[]
) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const p of planned) {
      await upsertVaccination(db, {
        id: randomUUID(),
        memberId,
        name: p.name,
        dose: p.dose,
        dueDate: p.dueDate,
        givenDate: null,
        facility: '',
        notes: '',
        recordId: null,
        scheduleKey: p.scheduleKey,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

/** For children vaccinated before the app was used: marks every past-due dose as given on its due date. */
export async function markPastDosesGiven(db: SQLiteDatabase, memberId: string, today: string) {
  const result = await db.runAsync(
    `UPDATE vaccinations SET givenDate = dueDate, updatedAt = ?
     WHERE memberId = ? AND givenDate IS NULL AND dueDate IS NOT NULL AND dueDate < ?`,
    new Date().toISOString(), memberId, today
  );
  return result.changes;
}

/**
 * Creates the vaccination record that holds the certificate (photo or PDF)
 * and links it, returning the record id. Reuses the link if one exists.
 */
export async function ensureCertificateRecord(db: SQLiteDatabase, v: Vaccination) {
  if (v.recordId) {
    const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM records WHERE id = ?', v.recordId);
    if (exists) return v.recordId;
  }
  const now = new Date().toISOString();
  const record: MedicalRecord = {
    id: randomUUID(),
    memberId: v.memberId,
    type: 'vaccination',
    title: [v.name, v.dose].filter(Boolean).join(' – '),
    date: v.givenDate ?? v.dueDate ?? todayIso(),
    doctor: '',
    facility: v.facility,
    notes: v.notes,
    createdAt: now,
    updatedAt: now,
  };
  await db.withTransactionAsync(async () => {
    await upsertRecord(db, record);
    await db.runAsync('UPDATE vaccinations SET recordId = ?, updatedAt = ? WHERE id = ?', record.id, now, v.id);
  });
  return record.id;
}
