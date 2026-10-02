import { Platform } from 'react-native';
import 'expo-router/entry';

// The Android home-screen widget draws itself in the background, so its task
// is registered when the app's JavaScript starts. Expo Go doesn't include the
// widget module; the app runs without it there.
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { widgetTaskHandler } = require('./src/widget/taskHandler') as typeof import('./src/widget/taskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // Widget module not available (Expo Go).
  }
}
