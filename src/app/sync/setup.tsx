import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, styles } from '@/components/ui';
import { startFamily, syncNow } from '@/lib/sync';
import { FAMILY_SCRIPT } from '@/lib/sync/script';
import { cleanStoreUrl } from '@/lib/sync/store';
import { showError } from '@/lib/useQuery';
import { t } from '@/i18n';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.row}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{n}</Text>
        </View>
        <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const Line = ({ children }: { children: string }) => <Text style={[styles.body, { lineHeight: 21 }]}>{children}</Text>;

/** Guides the main family member through deploying the family storage script and connects it. */
export default function FamilyStorageSetupScreen() {
  const { deviceName = '' } = useLocalSearchParams<{ deviceName?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function copy() {
    await Clipboard.setStringAsync(FAMILY_SCRIPT);
    Alert.alert(t('Script copied'), t('Now open Apps Script and paste it in place of the sample code.'));
  }

  async function connect() {
    const url = cleanStoreUrl(link);
    if (!url) {
      return Alert.alert(t('That isn’t a Web app link'), t('Copy the Web app URL shown after Deploy. It starts with https://script.google.com/macros/s/ and ends with /exec.'));
    }
    setBusy(true);
    try {
      await startFamily(db, url, deviceName || t('Family phone'));
      syncNow(db).catch(() => {});
      Alert.alert(t('Family storage is ready'), t('Family members can now join by scanning this phone’s family code.'), [{ text: t('OK'), onPress: () => router.back() }]);
    } catch (e) {
      showError(t('Couldn’t connect'), e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Set up family storage') }} />
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.subtitle, { lineHeight: 19 }]}>
          {t('You’ll add a small free script to your Google account. It keeps the family’s records, encrypted, in a folder in your Google Drive, and lets family phones send and receive them. A laptop is easiest, but a phone works too.')}
        </Text>

        <Step n={1} title={t('Copy the family storage script')}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} title={t('Copy script')} icon="copy-outline" onPress={copy} />
            <Button
              style={{ flex: 1 }}
              title={t('Send to laptop')}
              icon="share-outline"
              variant="secondary"
              onPress={() => Share.share({ message: FAMILY_SCRIPT })}
            />
          </View>
        </Step>

        <Step n={2} title={t('Paste it into Apps Script')}>
          <Line>{t('Open Apps Script and sign in with your Google account. It opens a new project.')}</Line>
          <Line>{t('Select all the sample code, replace it with the script, and tap Save.')}</Line>
          <Button title={t('Open Apps Script')} icon="open-outline" variant="secondary" onPress={() => Linking.openURL('https://script.google.com/create')} />
        </Step>

        <Step n={3} title={t('Publish it as a web app')}>
          <Line>{t('Tap Deploy → New deployment. Next to “Select type”, tap the gear and choose Web app.')}</Line>
          <Line>{t('Execute as: Me. Who has access: Anyone. Then tap Deploy.')}</Line>
          <Line>{t('Google asks you to authorise it. Choose your account; on “Google hasn’t verified this app”, tap Advanced, then Go to the project, then Allow. It’s your own script, so this is expected.')}</Line>
          <Line>{t('Copy the Web app URL it shows.')}</Line>
        </Step>

        <Step n={4} title={t('Paste the Web app link here')}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://script.google.com/macros/s/…/exec"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.input, { minHeight: 64 }]}
          />
          <Button title={t('Connect')} icon="link-outline" loading={busy} disabled={!link.trim()} onPress={connect} />
        </Step>

        <Text style={[styles.hint, { lineHeight: 18 }]}>
          {t('Free with any Google account, using your Drive space (15 GB free). The script can only store and return the family’s scrambled files; only phones with the family code can read them.')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
