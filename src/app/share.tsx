import * as DocumentPicker from 'expo-document-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, Icon, styles } from '@/components/ui';
import { importRegistryBundle, shareRegistryBundle } from '@/lib/share';
import { showError } from '@/lib/useQuery';

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={[styles.row, { alignItems: 'flex-start', marginTop: 6 }]}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{n}</Text>
      </View>
      <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

export default function ShareScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  async function exportAll() {
    setBusy('export');
    try {
      const res = await shareRegistryBundle(db);
      if (res.members === 0) Alert.alert('Nothing to share yet', 'Add a family member first.');
    } catch (e) {
      showError('Could not export', e);
    } finally {
      setBusy(null);
    }
  }

  async function importFile() {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (pick.canceled) return;
      setBusy('import');
      const r = await importRegistryBundle(db, pick.assets[0].uri);
      const lines = [
        `${r.membersAdded} new and ${r.membersUpdated} updated family members`,
        `${r.recordsAdded} new and ${r.recordsUpdated} updated records`,
        `${r.attachmentsAdded} files`,
      ];
      Alert.alert('Import complete', lines.join('\n'));
    } catch (e) {
      showError('Could not import', e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Card>
        <View style={styles.row}>
          <Icon name="cloud-upload-outline" color={colors.primary} size={26} />
          <Text style={[styles.title, { flex: 1 }]}>Send the whole family registry</Text>
        </View>
        <Text style={[styles.subtitle, { marginVertical: 8 }]}>
          Creates one file with every member, record and attachment. Send it over WhatsApp, email, AirDrop, Nearby Share or save it to Drive/iCloud as a backup.
        </Text>
        <Button title="Share family data file" icon="share-social-outline" onPress={exportAll} loading={busy === 'export'} />
      </Card>

      <Card>
        <View style={styles.row}>
          <Icon name="cloud-download-outline" color={colors.primary} size={26} />
          <Text style={[styles.title, { flex: 1 }]}>Receive records from family</Text>
        </View>
        <Text style={[styles.subtitle, { marginVertical: 8 }]}>
          Open a data file someone shared with you. New members and records are added; if both phones edited the same record, the most recent edit is kept.
        </Text>
        <Button title="Import data file" icon="cloud-download-outline" variant="secondary" onPress={importFile} loading={busy === 'import'} />
      </Card>

      <Card>
        <Text style={styles.title}>How family sharing works</Text>
        <Step n={1} text="Each family member installs the app on their own phone." />
        <Step n={2} text="Whoever adds new reports taps “Share family data file” (or “Send to family” on one person’s profile)." />
        <Step n={3} text="The others save the file and tap “Import data file”. Everyone now has the same records." />
        <Step n={4} text="Need to show a doctor? Use “Share PDF” on a profile or record for a printable summary." />
      </Card>

      <View style={[styles.row, { paddingHorizontal: 4, alignItems: 'flex-start' }]}>
        <Icon name="shield-checkmark-outline" color={colors.muted} size={18} />
        <Text style={[styles.subtitle, { flex: 1, marginTop: 0 }]}>
          Your records are stored only on this phone. Data files contain private medical information — share them only with people you trust.
        </Text>
      </View>
    </ScrollView>
  );
}
