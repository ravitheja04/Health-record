import type { SQLiteDatabase } from 'expo-sqlite';

import { todayIso } from '../lib/format';
import { listDoseLogs, listMedications } from '../lib/meds';
import { getLockConfig } from '../lib/settings';
import { nowMeasuredAt } from '../lib/vitalsAnalysis';
import { rowsForHeight, widgetModel } from './widgetData';

export const MEDICINES_WIDGET = 'TodayMedicines';

/** Reads what the medicines widget should show right now. */
export async function loadWidgetModel(db: SQLiteDatabase, heightDp: number) {
  const today = todayIso();
  const [lock, meds, logs] = await Promise.all([getLockConfig(db), listMedications(db), listDoseLogs(db, today)]);
  return widgetModel({ locked: lock.enabled, meds, logs, today, now: nowMeasuredAt().slice(11), maxRows: rowsForHeight(heightDp) });
}
