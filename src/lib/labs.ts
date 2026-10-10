import type { SQLiteDatabase } from 'expo-sqlite';

import type { LabPoint } from './labAnalysis';
import type { LabResult } from './types';

export function listResultsForRecord(db: SQLiteDatabase, recordId: string) {
  return db.getAllAsync<LabResult>(
    'SELECT * FROM lab_results WHERE recordId = ? ORDER BY createdAt ASC',
    recordId
  );
}

/** Every result for one family member, with the date of the report it came from. */
export function listMemberResults(db: SQLiteDatabase, memberId: string) {
  return db.getAllAsync<LabPoint>(
    `SELECT l.*, r.date AS date, r.title AS recordTitle
     FROM lab_results l JOIN records r ON r.id = l.recordId
     WHERE r.memberId = ?
     ORDER BY r.date ASC, l.createdAt ASC`,
    memberId
  );
}

/** Every family member's results, for the smart report's member picker. */
export function listAllResults(db: SQLiteDatabase) {
  return db.getAllAsync<LabPoint & { memberId: string }>(
    `SELECT l.*, r.date AS date, r.title AS recordTitle, r.memberId AS memberId
     FROM lab_results l JOIN records r ON r.id = l.recordId
     ORDER BY r.date ASC, l.createdAt ASC`
  );
}

export function countMemberResults(db: SQLiteDatabase, memberId: string) {
  return db
    .getFirstAsync<{ n: number }>(
      `SELECT COUNT(DISTINCT l.testKey) AS n FROM lab_results l JOIN records r ON r.id = l.recordId WHERE r.memberId = ?`,
      memberId
    )
    .then((row) => row?.n ?? 0);
}

/** Replaces all results of a report. Call inside a transaction. */
export async function replaceResultsForRecord(db: SQLiteDatabase, recordId: string, results: LabResult[]) {
  await db.runAsync('DELETE FROM lab_results WHERE recordId = ?', recordId);
  for (const r of results) await insertLabResult(db, r);
}

export async function insertLabResult(db: SQLiteDatabase, r: LabResult) {
  await db.runAsync(
    `INSERT OR REPLACE INTO lab_results (id, recordId, testKey, testName, value, unit, refLow, refHigh, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.id, r.recordId, r.testKey, r.testName, r.value, r.unit, r.refLow, r.refHigh, r.createdAt
  );
}

/** Marks a report as edited, so its new results win when the family data file is imported elsewhere. */
export async function touchRecord(db: SQLiteDatabase, recordId: string) {
  await db.runAsync('UPDATE records SET updatedAt = ? WHERE id = ?', new Date().toISOString(), recordId);
}
