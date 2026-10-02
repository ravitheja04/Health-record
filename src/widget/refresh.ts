import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { loadWidgetModel, MEDICINES_WIDGET } from './load';
import { todayMedicinesWidget } from './todayMedicinesWidget';

/**
 * Redraws the medicines widget after something changes in the app (a dose
 * logged, a medicine edited, app lock turned on). Does nothing when no widget
 * is on the home screen, on iOS, or in Expo Go.
 */
export function refreshMedicinesWidget(db: SQLiteDatabase) {
  if (Platform.OS !== 'android') return;
  import('react-native-android-widget')
    .then(({ requestWidgetUpdate }) =>
      requestWidgetUpdate({
        widgetName: MEDICINES_WIDGET,
        renderWidget: async (info) => todayMedicinesWidget(await loadWidgetModel(db, info.height)),
      })
    )
    .catch(() => {});
}
