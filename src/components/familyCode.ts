import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

import { isOtherFamily, isSameFamily, joinWithCode, syncNow } from '@/lib/sync';
import { decodeFamilyCode } from '@/lib/sync/familyCode';
import { t } from '@/i18n';

const confirm = (title: string, message: string, ok: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: t('Cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ])
  );

/**
 * Uses a family code that was scanned or pasted: joins that family (asking
 * first if this phone is in a different one). Returns what to tell the user,
 * or null if they cancelled. Throws if the family storage can't be reached.
 */
export async function applyFamilyCode(db: SQLiteDatabase, text: string, deviceName: string): Promise<string | null> {
  const code = decodeFamilyCode(text);
  if (!code) return t('That isn’t a family sync code. Ask for the code from the Family sync screen of their app.');
  if (await isSameFamily(code)) return t('This phone is already in this family.');
  if (
    (await isOtherFamily(code)) &&
    !(await confirm(
      t('Switch family?'),
      t('This code is from a different family group ({name}). This phone will stop syncing with its current family. Records on this phone stay.', { name: code.name }),
      t('Switch')
    ))
  ) {
    return null;
  }
  await joinWithCode(db, code, deviceName);
  syncNow(db).catch(() => {});
  return t('Joined the family. The family’s records will arrive in a moment, and what you add here reaches everyone.');
}
