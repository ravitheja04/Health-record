import type { SQLiteDatabase } from 'expo-sqlite';

import { listResultsForRecord } from '../labs';
import type { LabResult, MedicalRecord } from '../types';
import type { ExtractedRow } from './parseReport';

/**
 * How many results of a saved report match the report being imported: same
 * test and same value. Two or more matches (or all of a short report) means
 * it's very likely the same report imported twice.
 */
export function matchingResults(saved: Pick<LabResult, 'testKey' | 'value'>[], incoming: Pick<ExtractedRow, 'testKey' | 'value'>[]) {
  return incoming.filter((r) => saved.some((s) => s.testKey === r.testKey && Math.abs(s.value - r.value) < 1e-9)).length;
}

export function looksLikeSameReport(saved: Pick<LabResult, 'testKey' | 'value'>[], incoming: Pick<ExtractedRow, 'testKey' | 'value'>[]) {
  if (!saved.length || !incoming.length) return false;
  const matches = matchingResults(saved, incoming);
  return matches >= Math.min(2, incoming.length, saved.length);
}

/** A lab record for this person within 3 days of the report date whose results match it. */
export async function findDuplicateReport(db: SQLiteDatabase, memberId: string, date: string, rows: ExtractedRow[]) {
  const candidates = await db.getAllAsync<MedicalRecord>(
    `SELECT * FROM records WHERE memberId = ? AND type = 'lab' AND ABS(julianday(date) - julianday(?)) <= 3 ORDER BY date DESC`,
    memberId,
    date
  );
  for (const record of candidates) {
    if (looksLikeSameReport(await listResultsForRecord(db, record.id), rows)) return record;
  }
  return null;
}
