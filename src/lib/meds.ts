import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { stockChange } from './medSchedule';
import type { DoseLog, DoseStatus, MedFrequency, Medication } from './types';

type MedicationRow = Omit<Medication, 'times' | 'days' | 'remindersOn'> & {
  times: string;
  days: string;
  remindersOn: number;
};

export type MedicationWithMember = Medication & { memberName: string; memberColor: string };

function parseList<T>(json: string, valid: (v: unknown) => v is T): T[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter(valid) : [];
  } catch {
    return [];
  }
}

const isTime = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const isDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6;

function fromRow<T extends MedicationRow>(row: T): Omit<T, 'times' | 'days' | 'remindersOn'> & Medication {
  return {
    ...row,
    frequency: (row.frequency === 'weekly' ? 'weekly' : 'daily') as MedFrequency,
    times: parseList(row.times, isTime).sort(),
    days: parseList(row.days, isDay),
    remindersOn: row.remindersOn === 1,
  };
}

/** All medicines, or one member's, with the member's name and colour. */
export async function listMedications(db: SQLiteDatabase, memberId?: string) {
  const rows = await db.getAllAsync<MedicationRow & { memberName: string; memberColor: string }>(
    `SELECT md.*, m.name AS memberName, m.color AS memberColor
     FROM medications md JOIN members m ON m.id = md.memberId
     ${memberId ? 'WHERE md.memberId = ?' : ''}
     ORDER BY m.createdAt ASC, md.name COLLATE NOCASE ASC`,
    ...(memberId ? [memberId] : [])
  );
  return rows.map(fromRow) as MedicationWithMember[];
}

export async function getMedication(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<MedicationRow>('SELECT * FROM medications WHERE id = ?', id);
  return row ? (fromRow(row) as Medication) : null;
}

export async function upsertMedication(db: SQLiteDatabase, m: Medication) {
  await db.runAsync(
    `INSERT INTO medications (id, memberId, name, dose, instructions, times, frequency, days, startDate, endDate,
       stock, perDose, remindersOn, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       memberId = excluded.memberId, name = excluded.name, dose = excluded.dose,
       instructions = excluded.instructions, times = excluded.times, frequency = excluded.frequency,
       days = excluded.days, startDate = excluded.startDate, endDate = excluded.endDate,
       stock = excluded.stock, perDose = excluded.perDose, remindersOn = excluded.remindersOn,
       notes = excluded.notes, updatedAt = excluded.updatedAt`,
    m.id, m.memberId, m.name, m.dose, m.instructions, JSON.stringify(m.times), m.frequency, JSON.stringify(m.days),
    m.startDate, m.endDate, m.stock, m.perDose, m.remindersOn ? 1 : 0, m.notes, m.createdAt, m.updatedAt
  );
}

export async function deleteMedication(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM medications WHERE id = ?', id);
}

export function listDoseLogs(db: SQLiteDatabase, date: string) {
  return db.getAllAsync<DoseLog>('SELECT * FROM dose_logs WHERE date = ?', date);
}

export function listAllDoseLogs(db: SQLiteDatabase, medicationIds: string[]) {
  if (!medicationIds.length) return Promise.resolve([] as DoseLog[]);
  return db.getAllAsync<DoseLog>(
    `SELECT * FROM dose_logs WHERE medicationId IN (${medicationIds.map(() => '?').join(',')})`,
    ...medicationIds
  );
}

export async function insertDoseLogIfMissing(db: SQLiteDatabase, l: DoseLog) {
  await db.runAsync(
    'INSERT OR IGNORE INTO dose_logs (id, medicationId, date, time, status, loggedAt) VALUES (?, ?, ?, ?, ?, ?)',
    l.id, l.medicationId, l.date, l.time, l.status, l.loggedAt
  );
}

/**
 * Records a dose as taken or skipped, or clears it (null), and keeps the
 * remaining stock in step: taking a dose uses it up, undoing puts it back.
 */
export async function setDoseStatus(
  db: SQLiteDatabase,
  med: Medication,
  date: string,
  time: string,
  status: DoseStatus | null
) {
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<DoseLog>(
      'SELECT * FROM dose_logs WHERE medicationId = ? AND date = ? AND time = ?',
      med.id, date, time
    );
    const change = stockChange(existing?.status ?? 'pending', status ?? 'pending', med.perDose);
    if (status === null) {
      await db.runAsync('DELETE FROM dose_logs WHERE medicationId = ? AND date = ? AND time = ?', med.id, date, time);
    } else {
      await db.runAsync(
        `INSERT INTO dose_logs (id, medicationId, date, time, status, loggedAt) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(medicationId, date, time) DO UPDATE SET status = excluded.status, loggedAt = excluded.loggedAt`,
        existing?.id ?? randomUUID(), med.id, date, time, status, new Date().toISOString()
      );
    }
    if (change !== 0) {
      await db.runAsync(
        'UPDATE medications SET stock = MAX(0, stock + ?), updatedAt = ? WHERE id = ? AND stock IS NOT NULL',
        change, new Date().toISOString(), med.id
      );
    }
  });
}
