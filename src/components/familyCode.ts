import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

import { syncNow, isOtherFamily, joinWithCode } from '@/lib/sync';
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
 * first if this phone is in a different one) and adds the phone it came from.
 * Returns what to tell the user, or null if they cancelled.
 */
export async function applyFamilyCode(db: SQLiteDatabase, text: string, deviceName: string): Promise<string | null> {
  const code = decodeFamilyCode(text);
  if (!code) return t('That isn’t a family sync code. Ask for the code from the Family sync screen of their app.');
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
  const result = await joinWithCode(db, code, deviceName);
  if (result === 'joined' || result === 'added') syncNow(db).catch(() => {});
  switch (result) {
    case 'joined':
      return t('Joined {name}’s family. The family’s records will arrive in a moment.', { name: code.name });
    case 'added':
      return t('Added {name}. Their changes will now reach the whole family.', { name: code.name });
    case 'own-code':
      return t('That’s this phone’s own code. Scan a family member’s code instead.');
    case 'owner-not-ready':
      return t('{name} hasn’t finished setting up yet. Ask them to tap Sync now, then share the code again.', { name: code.name });
    case 'member-code':
      return t('This is {name}’s code. To join, scan the code on the main family member’s phone (the one whose Google Drive keeps the family’s records).', { name: code.name });
  }
}
