import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyFamilyCode } from '@/components/familyCode';
import { QrCode } from '@/components/QrCode';
import { Button, Card, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { isSyncing, leaveFamily, myFamilyCode, onSyncChange, removeFamilyPhone, startFamily, syncConfigured, syncNow } from '@/lib/sync';
import { restoreGoogleAccount, signInWithGoogle, signOutOfGoogle, type GoogleAccount } from '@/lib/sync/google';
import { getFamilyKey, getSyncState, saveSyncState } from '@/lib/sync/state';
import { showError, useQuery } from '@/lib/useQuery';

function when(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return formatDate(iso.slice(0, 10));
}

export default function FamilySyncScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const [state, key, members] = await Promise.all([getSyncState(db), getFamilyKey(), listMembers(db)]);
    const self = members.find((m) => m.relation === 'Self');
    return { state, joined: !!key, code: key ? await myFamilyCode(db) : null, suggestedName: self ? `${self.name.split(' ')[0]}’s phone` : '' };
  }, [db]);
  const { data, refresh } = useQuery(load);
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [syncing, setSyncing] = useState(isSyncing());
  const [name, setName] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    if (syncConfigured) restoreGoogleAccount().then(setAccount);
    return onSyncChange(() => {
      setSyncing(isSyncing());
      refresh();
    });
  }, [refresh]);

  if (!data) return null;
  const { state, joined, code } = data;
  const deviceName = name ?? (state.deviceName || data.suggestedName);

  if (!syncConfigured) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Stack.Screen options={{ title: 'Family sync' }} />
        <Card style={{ gap: 8 }}>
          <View style={styles.row}>
            <Icon name="cloud-offline-outline" color={colors.primary} size={26} />
            <Text style={[styles.title, { flex: 1 }]}>Not switched on in this build</Text>
          </View>
          <Text style={[styles.subtitle, { lineHeight: 19 }]}>
            Family sync uses Google Drive, which needs a one-time free setup by whoever builds the app (docs/google-drive-setup.md in the
            project). Until then, share records with the family data file from Share & Sync.
          </Text>
        </Card>
        <Button title="Share & Sync" icon="share-social-outline" variant="secondary" onPress={() => router.push('/share')} />
      </ScrollView>
    );
  }

  async function saveName() {
    if (name !== null && name.trim() !== state.deviceName) {
      await saveSyncState(db, { deviceName: name.trim(), lastHash: null });
      refresh();
    }
  }

  async function signIn() {
    try {
      const acc = await signInWithGoogle();
      if (acc) {
        setAccount(acc);
        syncNow(db).catch(() => {});
      }
    } catch (e) {
      showError('Google sign-in', e);
    }
  }

  async function start() {
    if (!deviceName.trim()) return Alert.alert('Name this phone', 'Family members see this name, e.g. “Ravi’s phone”.');
    await startFamily(db, deviceName.trim());
    refresh();
    syncNow(db).catch(() => {});
  }

  async function usePasted() {
    const message = await applyFamilyCode(db, pasted, deviceName.trim() || 'Family phone');
    if (message === null) return;
    setPasted('');
    setShowPaste(false);
    refresh();
    Alert.alert('Family sync', message);
  }

  async function runNow() {
    try {
      const report = await syncNow(db);
      if (report?.problems.length) Alert.alert('Synced with problems', report.problems.join('\n\n'));
    } catch (e) {
      showError('Sync failed', e);
    }
  }

  function leave() {
    Alert.alert('Stop family sync on this phone?', 'Records already on this phone stay. You can join again later with a family code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop syncing',
        style: 'destructive',
        onPress: async () => {
          await leaveFamily(db);
          refresh();
        },
      },
    ]);
  }

  const addButtons = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button
        style={{ flex: 1 }}
        title="Scan code"
        icon="qr-code-outline"
        variant={joined ? 'secondary' : 'primary'}
        onPress={() => router.push({ pathname: '/sync/scan', params: { deviceName: deviceName.trim() } })}
      />
      <Button style={{ flex: 1 }} title="Paste code" icon="clipboard-outline" variant="secondary" onPress={() => setShowPaste((v) => !v)} />
    </View>
  );
  const pasteBox = showPaste ? (
    <Card style={{ gap: 8 }}>
      <TextInput
        value={pasted}
        onChangeText={setPasted}
        placeholder="Paste the message with the family code"
        placeholderTextColor={colors.placeholder}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, styles.inputMultiline]}
      />
      <Button title="Use this code" icon="checkmark" disabled={!pasted.trim()} onPress={usePasted} />
    </Card>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Family sync' }} />
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {!joined ? (
          <>
            <Card style={{ gap: 8 }}>
              <View style={styles.row}>
                <Icon name="sync-outline" color={colors.primary} size={26} />
                <Text style={[styles.title, { flex: 1 }]}>Keep the family’s phones in step</Text>
              </View>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                Each phone keeps an encrypted copy of its records in its own Google Drive, and reads the other family phones’ copies.
                Changes arrive automatically when the app opens.
              </Text>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                Everything is locked with a family code that only your family’s phones have. Google, or anyone else, sees only scrambled
                data.
              </Text>
            </Card>
            <Field label="This phone’s name" value={deviceName} onChangeText={setName} placeholder="e.g. Ravi’s phone" />
            <SectionTitle>First phone in the family</SectionTitle>
            <Button title="Start family sync" icon="add-circle-outline" onPress={start} />
            <SectionTitle>Someone already started it</SectionTitle>
            <Text style={styles.subtitle}>Open Family sync on their phone and scan or paste their code.</Text>
            {addButtons}
            {pasteBox}
          </>
        ) : (
          <>
            <Card style={{ gap: 6 }}>
              <View style={styles.row}>
                <Icon name={state.lastError ? 'warning-outline' : 'cloud-done-outline'} color={state.lastError ? colors.warnStrong : colors.okText} size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{syncing ? 'Syncing…' : `Last synced ${when(state.lastSyncAt)}`}</Text>
                  <Text style={styles.subtitle}>
                    {state.peers.length} other family phone{state.peers.length === 1 ? '' : 's'} · {account ? 'sharing this phone’s records' : 'receiving only'}
                  </Text>
                </View>
                {syncing ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
              {state.lastError ? <Text style={{ color: colors.warnText }}>{state.lastError}</Text> : null}
              <Button title="Sync now" icon="sync-outline" variant="secondary" disabled={syncing} onPress={runNow} />
            </Card>

            <SectionTitle>Google account</SectionTitle>
            <Card style={{ gap: 8 }}>
              {account ? (
                <>
                  <Text style={styles.body}>Signed in as {account.email}</Text>
                  <Text style={styles.subtitle}>The app can only see the files it creates in this Drive, nothing else.</Text>
                  <Button
                    title="Sign out"
                    icon="log-out-outline"
                    variant="secondary"
                    onPress={async () => {
                      await signOutOfGoogle();
                      setAccount(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                    Sign in so this phone’s records go to the family too. Without it, this phone only receives.
                  </Text>
                  <Button title="Sign in with Google" icon="logo-google" onPress={signIn} />
                </>
              )}
            </Card>

            <Field label="This phone’s name" value={deviceName} onChangeText={setName} onBlur={saveName} />

            <SectionTitle>This phone’s family code</SectionTitle>
            <Card style={{ gap: 10, alignItems: 'center' }}>
              {code ? <QrCode text={code} size={200} label="Family sync code" /> : null}
              <Text style={[styles.subtitle, { textAlign: 'center', lineHeight: 19 }]}>
                {state.myFileId
                  ? 'Let family scan this, or share it on WhatsApp. It opens the family’s records, so share it only with family.'
                  : account
                    ? 'Sync once so the code includes this phone’s records.'
                    : 'Sign in with Google so the code includes this phone’s records. Without that, it only lets others join.'}
              </Text>
              {code ? (
                <Button
                  style={{ alignSelf: 'stretch' }}
                  title="Share code"
                  icon="share-outline"
                  variant="secondary"
                  onPress={() => Share.share({ message: `Family Health Registry, family sync code. Paste it in Family sync:\n\n${code}` })}
                />
              ) : null}
            </Card>

            <SectionTitle>Family phones</SectionTitle>
            {state.peers.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {state.peers.map((p, i) => (
                  <View key={p.fileId} style={[styles.row, { padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle }]}>
                    <Icon name="phone-portrait-outline" color={p.lastError ? colors.warnStrong : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{p.name}</Text>
                      <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }, p.lastError ? { color: colors.warnText } : null]}>
                        {p.lastError ?? (p.lastModified ? `Updated ${when(p.lastModified)}` : 'Waiting for first sync')}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`Remove ${p.name}`}
                      hitSlop={10}
                      onPress={() =>
                        Alert.alert(`Remove ${p.name}?`, 'This phone stops reading its records. It can be added again with its code.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: async () => {
                              await removeFamilyPhone(db, p.fileId);
                              refresh();
                            },
                          },
                        ])
                      }>
                      <Icon name="close-outline" color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            ) : (
              <Text style={styles.subtitle}>No other phones yet. Scan a family member’s code, and let them scan yours.</Text>
            )}
            {addButtons}
            {pasteBox}

            <Text style={[styles.hint, { lineHeight: 18 }]}>
              Deleting something on one phone doesn’t delete it on the others yet. Edits sync; the newest edit wins.
            </Text>
            <Button title="Stop family sync on this phone" icon="close-circle-outline" variant="danger" onPress={leave} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
