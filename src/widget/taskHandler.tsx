import { openDatabaseAsync } from 'expo-sqlite';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { DATABASE_NAME, migrateDbIfNeeded } from '../lib/db';
import { todayIso } from '../lib/format';
import { getMedication, setDoseStatus } from '../lib/meds';
import { syncReminders } from '../lib/reminders';
import { loadWidgetModel, MEDICINES_WIDGET } from './load';
import { todayMedicinesWidget } from './todayMedicinesWidget';

/**
 * Runs in the background when Android asks the home-screen widget to draw
 * (added, resized, every 30 minutes) or when its "✓ Taken" button is tapped.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetInfo.widgetName !== MEDICINES_WIDGET || widgetAction === 'WIDGET_DELETED') return;
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    // The widget can be added before the app was ever opened.
    await migrateDbIfNeeded(db);
    if (widgetAction === 'WIDGET_CLICK' && clickAction === 'MARK_TAKEN') {
      const { medicationId, time } = (clickActionData ?? {}) as { medicationId?: string; time?: string };
      const med = medicationId ? await getMedication(db, medicationId) : null;
      if (med && time) {
        await setDoseStatus(db, med, todayIso(), time, 'taken');
        await syncReminders(db).catch(() => {});
      }
    }
    renderWidget(todayMedicinesWidget(await loadWidgetModel(db, widgetInfo.height)));
  } finally {
    await db.closeAsync();
  }
}
