import type { SQLiteDatabase } from 'expo-sqlite';

import { todayIso } from '../lib/format';
import { listDoseLogs, listMedications } from '../lib/meds';
import { resolveLang, setLang } from '../i18n';
import { deviceLanguage } from '../i18n/device';
import { getLangPref, getLockConfig } from '../lib/settings';
import { nowMeasuredAt } from '../lib/vitalsAnalysis';
import { rowsForHeight, widgetModel } from './widgetData';

export const MEDICINES_WIDGET = 'TodayMedicines';

/** Reads what the medicines widget should show right now. */
export async function loadWidgetModel(db: SQLiteDatabase, heightDp: number) {
  const today = todayIso();
  const [lock, meds, logs, lang] = await Promise.all([getLockConfig(db), listMedications(db), listDoseLogs(db, today), getLangPref(db)]);
  // The widget can draw while the app isn't running, so it applies the language choice itself.
  setLang(resolveLang(lang, deviceLanguage()));
  return widgetModel({ locked: lock.enabled, meds, logs, today, now: nowMeasuredAt().slice(11), maxRows: rowsForHeight(heightDp) });
}
