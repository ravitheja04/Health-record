import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

/**
 * Runs `load` whenever the screen gains focus, so lists refresh automatically
 * after returning from an edit screen, and again on `refresh()`.
 * Wrap `load` in useCallback.
 */
export function useQuery<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((result) => {
          if (active) setData(result);
        })
        .catch((e) => showError('Could not load data', e));
      return () => {
        active = false;
      };
    }, [load])
  );

  const refresh = useCallback(() => {
    load()
      .then(setData)
      .catch((e) => showError('Could not load data', e));
  }, [load]);
  return { data, refresh };
}

export function showError(title: string, e: unknown) {
  Alert.alert(title, e instanceof Error ? e.message : String(e));
}
