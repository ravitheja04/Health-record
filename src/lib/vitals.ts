import type { SQLiteDatabase } from 'expo-sqlite';

import type { Vital, VitalType } from './types';

export function listVitals(db: SQLiteDatabase, memberId: string, type?: VitalType) {
  return db.getAllAsync<Vital>(
    `SELECT * FROM vitals WHERE memberId = ? ${type ? 'AND type = ?' : ''} ORDER BY measuredAt ASC`,
    ...(type ? [memberId, type] : [memberId])
  );
}

export function getVital(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Vital>('SELECT * FROM vitals WHERE id = ?', id);
}

export async function upsertVital(db: SQLiteDatabase, v: Vital) {
  await db.runAsync(
    `INSERT INTO vitals (id, memberId, type, value, value2, context, measuredAt, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       memberId = excluded.memberId, type = excluded.type, value = excluded.value, value2 = excluded.value2,
       context = excluded.context, measuredAt = excluded.measuredAt, notes = excluded.notes, updatedAt = excluded.updatedAt`,
    v.id, v.memberId, v.type, v.value, v.value2, v.context, v.measuredAt, v.notes, v.createdAt, v.updatedAt
  );
}

export async function deleteVital(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM vitals WHERE id = ?', id);
}

export function listAllVitals(db: SQLiteDatabase, memberIds: string[]) {
  if (!memberIds.length) return Promise.resolve([] as Vital[]);
  return db.getAllAsync<Vital>(
    `SELECT * FROM vitals WHERE memberId IN (${memberIds.map(() => '?').join(',')})`,
    ...memberIds
  );
}
