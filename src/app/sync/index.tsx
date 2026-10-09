import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyFamilyCode } from '@/components/familyCode';
import { QrCode } from '@/components/QrCode';
import { Button, Card, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { isSyncing, leaveFamily, myFamilyCode, onSyncChange, syncNow } from '@/lib/sync';
import { getFamilyKey, getSyncState, saveSyncState } from '@/lib/sync/state';
import { showError, useQuery } from '@/lib/useQuery';
import { t, tn } from '@/i18n';

function when(iso: string | null) {
  if (!iso) return t('never');
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n} min ago', { n: mins });
  if (mins < 24 * 60) return t('{n} h ago', { n: Math.round(mins / 60) });
  return formatDate(iso.slice(0, 10));
}

export default function FamilySyncScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const [state, key, members] = await Promise.all([getSyncState(db), getFamilyKey(), listMembers(db)]);
    const self = members.find((m) => m.relation === 'Self');
    return {
      state,
      joined: !!key && !!state.url,
      code: await myFamilyCode(db),
      suggestedName: self ? t('{name}’s phone', { name: self.name.split(' ')[0] }) : '',
    };
  }, [db]);
  const { data, refresh } = useQuery(load);
  const [syncing, setSyncing] = useState(isSyncing());
  const [name, setName] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(
    () =>
      onSyncChange(() => {
        setSyncing(isSyncing());
        refresh();
      }),
    [refresh]
  );

  if (!data) return null;
  const { state, joined, code } = data;
  const deviceName = name ?? (state.deviceName || data.suggestedName);

  async function saveName() {
    if (name !== null && name.trim() !== state.deviceName) {
      await saveSyncState(db, { deviceName: name.trim(), lastHash: null });
      refresh();
    }
  }

  function needName() {
    if (deviceName.trim()) return false;
    Alert.alert(t('Name this phone'), t('Family members see this name, e.g. “Ravi’s phone”.'));
    return true;
  }

  async function usePasted() {
    if (needName()) return;
    setJoining(true);
    try {
      const message = await applyFamilyCode(db, pasted, deviceName.trim());
      if (message === null) return;
      setPasted('');
      setShowPaste(false);
      refresh();
      Alert.alert(t('Family sync'), message);
    } catch (e) {
      showError(t('Couldn’t join'), e);
    } finally {
      setJoining(false);
    }
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

  const joinButtons = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button
        style={{ flex: 1 }}
        title={t('Scan code')}
        icon="qr-code-outline"
        variant={joined ? 'secondary' : 'primary'}
        onPress={() => {
          if (!needName()) router.push({ pathname: '/sync/scan', params: { deviceName: deviceName.trim() } });
        }}
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
      <Button title={t('Use this code')} icon="checkmark" loading={joining} disabled={!pasted.trim()} onPress={usePasted} />
    </Card>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Family sync') }} />
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {!joined ? (
          <>
            <Card style={{ gap: 8 }}>
              <View style={styles.row}>
                <Icon name="people-outline" color={colors.primary} size={26} />
                <Text style={[styles.title, { flex: 1 }]}>{t('Share records with your family')}</Text>
              </View>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                {t('The main family member sets up free family storage in their own Google Drive, once. Everyone else joins by scanning their code; nobody else needs a Google account. Every phone sees and adds to the same family records.')}
              </Text>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                {t('Everything is locked with a family code that only your family’s phones have. Google, or anyone else, sees only scrambled data.')}
              </Text>
            </Card>
            <Field label={t('This phone’s name')} value={deviceName} onChangeText={setName} placeholder={t('e.g. Ravi’s phone')} />
            <SectionTitle>{t('Join my family')}</SectionTitle>
            <Text style={styles.subtitle}>{t('Open Family sync on a family member’s phone and scan or paste their code.')}</Text>
            {joinButtons}
            {pasteBox}
            <SectionTitle>{t('I’m the main family member')}</SectionTitle>
            <Text style={styles.subtitle}>{t('Set up the family storage in your Google Drive. About 5 minutes, free, and done only once for the whole family.')}</Text>
            <Button
              title={t('Set up family storage')}
              icon="cloud-upload-outline"
              variant="secondary"
              onPress={() => {
                if (!needName()) router.push({ pathname: '/sync/setup', params: { deviceName: deviceName.trim() } });
              }}
            />
          </>
        ) : (
          <>
            <Card style={{ gap: 6 }}>
              <View style={styles.row}>
                <Icon name={state.lastError ? 'warning-outline' : 'cloud-done-outline'} color={state.lastError ? colors.warnStrong : colors.okText} size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{syncing ? t('Syncing…') : t('Last synced {when}', { when: when(state.lastSyncAt) })}</Text>
                  <Text style={styles.subtitle}>{tn(state.phones.length, '{n} other family phone', '{n} other family phones')}</Text>
                </View>
                {syncing ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
              {state.lastError ? <Text style={{ color: colors.warnText }}>{state.lastError}</Text> : null}
              <Button title={t('Sync now')} icon="sync-outline" variant="secondary" disabled={syncing} onPress={runNow} />
            </Card>

            <SectionTitle>{t('Family code')}</SectionTitle>
            <Card style={{ gap: 10, alignItems: 'center' }}>
              {code ? <QrCode text={code} size={200} label={t('Family sync code')} /> : null}
              <Text style={[styles.subtitle, { textAlign: 'center', lineHeight: 19 }]}>
                {t('Family members scan this to join, or you share it on WhatsApp. It opens the family’s records, so share it only with family.')}
              </Text>
              {code ? (
                <Button
                  style={{ alignSelf: 'stretch' }}
                  title={t('Share code')}
                  icon="share-outline"
                  variant="secondary"
                  onPress={() => Share.share({ message: `${t('Family Health Registry, family sync code. Paste it in Family sync:')}\n\n${code}` })}
                />
              ) : null}
            </Card>

            <SectionTitle>{t('Family phones')}</SectionTitle>
            {state.phones.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {state.phones.map((p, i) => (
                  <View key={p.file} style={[styles.row, { padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle }]}>
                    <Icon name="phone-portrait-outline" color={p.lastError ? colors.warnStrong : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{p.name}</Text>
                      <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }, p.lastError ? { color: colors.warnText } : null]}>
                        {p.lastError ?? (p.lastModified ? t('Updated {when}', { when: when(p.lastModified) }) : t('Waiting for their files'))}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <Text style={styles.subtitle}>{t('No other phones yet. Family members join by scanning the code above.')}</Text>
            )}

            <Field label={t('This phone’s name')} value={deviceName} onChangeText={setName} onBlur={saveName} />

            <Text style={[styles.hint, { lineHeight: 18 }]}>
              {t('Deleting something on one phone doesn’t delete it on the others yet. Edits sync; the newest edit wins.')}
            </Text>
            <Button title={t('Stop family sync on this phone')} icon="close-circle-outline" variant="danger" onPress={leave} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
