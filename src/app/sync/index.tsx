import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyFamilyCode } from '@/components/familyCode';
import { QrCode } from '@/components/QrCode';
import { Button, Card, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { shareRegistryBundle } from '@/lib/share';
import { formatDate } from '@/lib/format';
import { isSyncing, leaveFamily, myFamilyCode, onSyncChange, removeFamilyPhone, startFamily, syncConfigured, syncNow } from '@/lib/sync';
import { restoreGoogleAccount, signInWithGoogle, signOutOfGoogle, type GoogleAccount } from '@/lib/sync/google';
import { getFamilyKey, getSyncState, saveSyncState } from '@/lib/sync/state';
import { showError, useQuery } from '@/lib/useQuery';
import { t } from '@/i18n';

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
        <Stack.Screen options={{ title: t('Family sync') }} />
        <Card style={{ gap: 8 }}>
          <View style={styles.row}>
            <Icon name="cloud-offline-outline" color={colors.primary} size={26} />
            <Text style={[styles.title, { flex: 1 }]}>{t('Not switched on in this build')}</Text>
          </View>
          <Text style={[styles.subtitle, { lineHeight: 19 }]}>
            {t('Family sync uses Google Drive, which needs a one-time free setup by whoever builds the app (docs/google-drive-setup.md in the project). Until then, share records with the family data file from Share & Sync.')}
          </Text>
        </Card>
        <Button title={t('Share & Sync')} icon="share-social-outline" variant="secondary" onPress={() => router.push('/share')} />
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
      showError(t('Google sign-in'), e);
    }
  }

  /** The main family member links their Google Drive and starts the family. */
  async function start() {
    if (!deviceName.trim()) return Alert.alert(t('Name this phone'), t('Family members see this name, e.g. “Ravi’s phone”.'));
    try {
      const acc = account ?? (await signInWithGoogle());
      if (!acc) return;
      setAccount(acc);
      await startFamily(db, deviceName.trim());
      refresh();
      syncNow(db).catch(() => {});
    } catch (e) {
      showError(t('Google sign-in'), e);
    }
  }

  async function sendAsFile() {
    try {
      await shareRegistryBundle(db);
    } catch (e) {
      showError(t('Could not share'), e);
    }
  }

  async function usePasted() {
    const message = await applyFamilyCode(db, pasted, deviceName.trim() || 'Family phone');
    if (message === null) return;
    setPasted('');
    setShowPaste(false);
    refresh();
    Alert.alert(t('Family sync'), message);
  }

  async function runNow() {
    try {
      const report = await syncNow(db);
      if (report?.problems.length) Alert.alert(t('Synced with problems'), report.problems.join('\n\n'));
    } catch (e) {
      showError(t('Sync failed'), e);
    }
  }

  function leave() {
    Alert.alert(t('Stop family sync on this phone?'), t('Records already on this phone stay. You can join again later with a family code.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Stop syncing'),
        style: 'destructive',
        onPress: async () => {
          await leaveFamily(db);
          refresh();
        },
      },
    ]);
  }

  const scanButtons = (primary: boolean) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button
        style={{ flex: 1 }}
        title={t('Scan code')}
        icon="qr-code-outline"
        variant={primary ? 'primary' : 'secondary'}
        onPress={() => router.push({ pathname: '/sync/scan', params: { deviceName: deviceName.trim() } })}
      />
      <Button style={{ flex: 1 }} title={t('Paste code')} icon="clipboard-outline" variant="secondary" onPress={() => setShowPaste((v) => !v)} />
    </View>
  );
  const pasteBox = showPaste ? (
    <Card style={{ gap: 8 }}>
      <TextInput
        value={pasted}
        onChangeText={setPasted}
        placeholder={t('Paste the message with the family code')}
        placeholderTextColor={colors.placeholder}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, styles.inputMultiline]}
      />
      <Button title={t('Use this code')} icon="checkmark" disabled={!pasted.trim()} onPress={usePasted} />
    </Card>
  ) : null;

  const owner = state.role === 'member' ? (state.peers[0] ?? null) : null;
  const statusCard = (
    <Card style={{ gap: 6 }}>
      <View style={styles.row}>
        <Icon name={state.lastError ? 'warning-outline' : 'cloud-done-outline'} color={state.lastError ? colors.warnStrong : colors.okText} size={24} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{syncing ? t('Syncing…') : t('Last synced {when}', { when: when(state.lastSyncAt) })}</Text>
          <Text style={styles.subtitle}>
            {state.role === 'owner'
              ? account
                ? t('Family records are kept in your Google Drive ({email})', { email: account.email })
                : t('Your Google Drive isn’t linked on this phone')
              : t('Family records come from {name}’s Google Drive', { name: owner?.name ?? t('the main family member') })}
          </Text>
        </View>
        {syncing ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {state.lastError ? <Text style={{ color: colors.warnText }}>{state.lastError}</Text> : null}
      <Button title={t('Sync now')} icon="sync-outline" variant="secondary" disabled={syncing} onPress={runNow} />
    </Card>
  );
  const codeCard = (title: string, note: string) =>
    code ? (
      <Card style={{ gap: 10, alignItems: 'center' }}>
        <Text style={[styles.title, { alignSelf: 'stretch' }]}>{title}</Text>
        <QrCode text={code} size={200} label={t('Family sync code')} />
        <Text style={[styles.subtitle, { textAlign: 'center', lineHeight: 19 }]}>{note}</Text>
        <Button
          style={{ alignSelf: 'stretch' }}
          title={t('Share code')}
          icon="share-outline"
          variant="secondary"
          onPress={() => Share.share({ message: `${t('Family Health Registry, family sync code. Paste it in Family sync:')}\n\n${code}` })}
        />
      </Card>
    ) : null;
  const leaveButton = <Button title={t('Stop family sync on this phone')} icon="close-circle-outline" variant="danger" onPress={leave} />;
  const deleteNote = (
    <Text style={[styles.hint, { lineHeight: 18 }]}>
      {t('Deleting something on one phone doesn’t delete it on the others yet. Edits sync; the newest edit wins.')}
    </Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Family sync') }} />
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {!joined ? (
          <>
            <Card style={{ gap: 8 }}>
              <View style={styles.row}>
                <Icon name="people-outline" color={colors.primary} size={26} />
                <Text style={[styles.title, { flex: 1 }]}>{t('Share the family’s records through one Google Drive')}</Text>
              </View>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                {t('The main family member links their Google Drive. The whole family’s records are kept there, and everyone else joins by scanning their code. Others don’t need a Google account to see the records.')}
              </Text>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                {t('Everything is locked with a family code that only your family’s phones have. Google, or anyone else, sees only scrambled data.')}
              </Text>
            </Card>
            <Field label={t('This phone’s name')} value={deviceName} onChangeText={setName} placeholder={t('e.g. Ravi’s phone')} />
            <SectionTitle>{t('I’m the main family member')}</SectionTitle>
            <Text style={styles.subtitle}>{t('Keep the family’s records in your Google Drive. Free; the app can only see the files it creates there.')}</Text>
            <Button title={t('Link my Google Drive')} icon="logo-google" onPress={start} />
            <SectionTitle>{t('Join my family')}</SectionTitle>
            <Text style={styles.subtitle}>{t('Open Family sync on the main family member’s phone and scan or paste their code.')}</Text>
            {scanButtons(false)}
            {pasteBox}
          </>
        ) : state.role === 'owner' ? (
          <>
            {statusCard}
            {!account ? (
              <Card style={{ gap: 8 }}>
                <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                  {t('Sign in with the Google account that keeps the family’s records, so family phones get your updates.')}
                </Text>
                <Button title={t('Link my Google Drive')} icon="logo-google" onPress={signIn} />
              </Card>
            ) : null}

            {codeCard(
              t('Family code'),
              state.myFileId
                ? t('Family members scan this to join, or you share it on WhatsApp. It opens the family’s records, so share it only with family.')
                : t('Sync once to create the family code.')
            )}

            <Field label={t('This phone’s name')} value={deviceName} onChangeText={setName} onBlur={saveName} />

            <SectionTitle>{t('Phones sending changes')}</SectionTitle>
            {state.peers.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {state.peers.map((p, i) => (
                  <View key={p.fileId} style={[styles.row, { padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle }]}>
                    <Icon name="phone-portrait-outline" color={p.lastError ? colors.warnStrong : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{p.name}</Text>
                      <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }, p.lastError ? { color: colors.warnText } : null]}>
                        {p.lastError ?? (p.lastModified ? t('Updated {when}', { when: when(p.lastModified) }) : t('Waiting for first sync'))}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel={t('Remove {name}', { name: p.name })}
                      hitSlop={10}
                      onPress={() =>
                        Alert.alert(t('Remove {name}?', { name: p.name }), t('Their changes stop reaching the family. They still see the family’s records until they stop syncing.'), [
                          { text: t('Cancel'), style: 'cancel' },
                          {
                            text: t('Remove'),
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
            ) : null}
            <Text style={[styles.subtitle, { lineHeight: 19 }]}>
              {t('Family members who also sign in with Google show a code on their phone. Scan it once, and their changes reach everyone through your Drive. Members without Google can send changes as a file: open it in Share & Sync, then Import.')}
            </Text>
            {scanButtons(false)}
            {pasteBox}
            {account ? (
              <Button
                title={t('Sign out of Google')}
                icon="log-out-outline"
                variant="secondary"
                onPress={async () => {
                  await signOutOfGoogle();
                  setAccount(null);
                }}
              />
            ) : null}
            {deleteNote}
            {leaveButton}
          </>
        ) : (
          <>
            {statusCard}
            <SectionTitle>{t('Changes made on this phone')}</SectionTitle>
            <Card style={{ gap: 8 }}>
              {!account ? (
                <>
                  <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                    {t('You see the whole family’s records. Anything you add here stays on this phone until you send it to {name}.', { name: owner?.name ?? t('the main family member') })}
                  </Text>
                  <Button title={t('Send my changes as a file')} icon="share-outline" variant="secondary" onPress={sendAsFile} />
                  <Text style={[styles.hint, { lineHeight: 18 }]}>{t('Send it on WhatsApp; they open it in Share & Sync, then Import.')}</Text>
                  <Text style={[styles.subtitle, { lineHeight: 19, marginTop: 6 }]}>{t('Or sign in with your own Google account to send changes automatically.')}</Text>
                  <Button title={t('Sign in with Google')} icon="logo-google" variant="secondary" onPress={signIn} />
                </>
              ) : owner?.knowsMe ? (
                <>
                  <View style={styles.row}>
                    <Icon name="checkmark-circle" color={colors.okText} />
                    <Text style={[styles.body, { flex: 1 }]}>{t('Your changes reach the family through {name}’s Drive.', { name: owner.name })}</Text>
                  </View>
                  <Text style={styles.subtitle}>{t('Signed in as {email}', { email: account.email })}</Text>
                </>
              ) : (
                <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                  {state.myFileId
                    ? t('One more step: let {name} scan the code below once, so your changes reach the family.', { name: owner?.name ?? t('the main family member') })
                    : t('Sync once to create this phone’s code.')}
                </Text>
              )}
            </Card>
            {account && !owner?.knowsMe && state.myFileId ? codeCard(t('This phone’s code'), t('Show this to {name}, or send it on WhatsApp.', { name: owner?.name ?? t('the main family member') })) : null}
            {account ? (
              <Button
                title={t('Sign out of Google')}
                icon="log-out-outline"
                variant="secondary"
                onPress={async () => {
                  await signOutOfGoogle();
                  setAccount(null);
                }}
              />
            ) : null}

            <Field label={t('This phone’s name')} value={deviceName} onChangeText={setName} onBlur={saveName} />
            <SectionTitle>{t('New main phone?')}</SectionTitle>
            <Text style={styles.subtitle}>{t('If the family’s records move to someone else’s Drive, scan their code.')}</Text>
            {scanButtons(false)}
            {pasteBox}
            {deleteNote}
            {leaveButton}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
