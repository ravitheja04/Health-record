import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/DateField';
import { Button, Card, ChipSelect, colors, Field, Icon, styles } from '@/components/ui';
import * as DB from '@/lib/db';
import { formatBytes, persistPendingFile, removeAttachmentFiles, type PendingFile } from '@/lib/files';
import { isValidDate, todayIso } from '@/lib/format';
import { showError } from '@/lib/useQuery';
import { RECORD_TYPES, type Attachment, type MedicalRecord, type Member, type RecordType } from '@/lib/types';
import { t } from '@/i18n';

const TYPE_KEYS = Object.keys(RECORD_TYPES) as RecordType[];

export default function EditRecordScreen() {
  const params = useLocalSearchParams<{ id?: string; memberId?: string; type?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [removed, setRemoved] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setMembers(await DB.listMembers(db));
      if (params.id) {
        const r = await DB.getRecord(db, params.id);
        if (r) {
          setRecord(r);
          setExisting(await DB.listAttachments(db, r.id));
          return;
        }
      }
      const now = new Date().toISOString();
      setRecord({
        id: randomUUID(),
        memberId: params.memberId ?? '',
        type: params.type && params.type in RECORD_TYPES ? (params.type as RecordType) : 'lab',
        title: '',
        date: todayIso(),
        doctor: '',
        facility: '',
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
    })().catch((e) => showError(t('Could not load record'), e));
  }, [db, params.id, params.memberId, params.type]);

  if (!record) return null;
  const set = <K extends keyof MedicalRecord>(key: K, value: MedicalRecord[K]) => setRecord({ ...record, [key]: value });

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('Camera access needed'), t('Allow camera access in Settings to photograph reports.'));
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) addImages(res.assets);
  }

  async function pickPhotos() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true });
    if (!res.canceled) addImages(res.assets);
  }

  function addImages(assets: ImagePicker.ImagePickerAsset[]) {
    setPending((p) => [
      ...p,
      ...assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `Photo ${p.length + i + 1}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
        size: a.fileSize ?? 0,
      })),
    ]);
  }

  async function pickDocuments() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    setPending((p) => [
      ...p,
      ...res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 })),
    ]);
  }

  async function save() {
    if (!record) return;
    if (!record.memberId) return Alert.alert(t('Choose a family member'), t('Select who this record belongs to.'));
    if (!record.title.trim()) return Alert.alert(t('Title required'), t('Give the record a short title, e.g. “Blood test – CBC”.'));
    if (!isValidDate(record.date)) {
      return Alert.alert(t('Check the date'), t('Enter it as DD/MM/YYYY, for example 14/03/2026, or pick it from the calendar.'));
    }

    setSaving(true);
    try {
      const saved: Attachment[] = [];
      for (const p of pending) saved.push(await persistPendingFile(record.id, p));
      await db.withTransactionAsync(async () => {
        await DB.upsertRecord(db, { ...record, title: record.title.trim(), updatedAt: new Date().toISOString() });
        for (const a of saved) await DB.insertAttachment(db, a);
        for (const a of removed) await DB.deleteAttachmentRow(db, a.id);
      });
      removeAttachmentFiles(removed);
      if (params.id) router.back();
      else router.replace({ pathname: '/record/[id]', params: { id: record.id } });
    } catch (e) {
      showError(t('Could not save record'), e);
      setSaving(false);
    }
  }

  const fileRows = [
    ...existing.map((a) => ({ key: a.id, name: a.name, mimeType: a.mimeType, size: a.size, onRemove: () => {
      setExisting((list) => list.filter((x) => x.id !== a.id));
      setRemoved((list) => [...list, a]);
    } })),
    ...pending.map((p, i) => ({ key: `${p.uri}-${i}`, name: p.name, mimeType: p.mimeType, size: p.size, onRemove: () =>
      setPending((list) => list.filter((_, j) => j !== i)) })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: params.id ? 'Edit record' : 'New record' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <ChipSelect
          label={t('Family member *')}
          options={members.map((m) => m.id)}
          value={record.memberId || null}
          onChange={(v) => set('memberId', v ?? '')}
          renderLabel={(mid) => members.find((m) => m.id === mid)?.name ?? ''}
        />
        <ChipSelect
          label={t('Record type')}
          options={TYPE_KEYS}
          value={record.type}
          onChange={(v) => set('type', v ?? 'other')}
          renderLabel={(t) => RECORD_TYPES[t].label}
        />
        <Field label={t('Title *')} value={record.title} onChangeText={(v) => set('title', v)} placeholder={t('e.g. Complete blood count')} />
        <DateField label={t('Date *')} value={record.date} onChange={(v) => set('date', v ?? '')} />
        <Field label={t('Doctor')} value={record.doctor} onChangeText={(v) => set('doctor', v)} placeholder={t('e.g. Dr. Mehta')} />
        <Field label={t('Hospital / Lab / Clinic')} value={record.facility} onChangeText={(v) => set('facility', v)} placeholder={t('e.g. City Diagnostics')} />
        <Field
          label={t('Notes / results')}
          value={record.notes}
          onChangeText={(v) => set('notes', v)}
          placeholder={t('Key results, dosage, follow-up date…')}
          multiline
        />

        <View style={styles.field}>
          <Text style={styles.label}>{t('Attachments')}</Text>
          {fileRows.map((f) => (
            <Card key={f.key} style={{ paddingVertical: 10 }}>
              <View style={styles.row}>
                <Icon name={f.mimeType.startsWith('image/') ? 'image-outline' : 'document-outline'} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.body} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.size ? <Text style={styles.subtitle}>{formatBytes(f.size)}</Text> : null}
                </View>
                <Pressable accessibilityLabel={t('Remove {name}', { name: f.name })} hitSlop={8} onPress={f.onRemove}>
                  <Icon name="trash-outline" color={colors.danger} />
                </Pressable>
              </View>
            </Card>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} variant="secondary" title={t('Camera')} icon="camera-outline" onPress={() => takePhoto().catch((e) => showError(t('Camera error'), e))} />
            <Button style={{ flex: 1 }} variant="secondary" title={t('Photos')} icon="image-outline" onPress={() => pickPhotos().catch((e) => showError(t('Photos error'), e))} />
            <Button style={{ flex: 1 }} variant="secondary" title={t('Files')} icon="attach-outline" onPress={() => pickDocuments().catch((e) => showError(t('Files error'), e))} />
          </View>
        </View>

        <Button title={params.id ? t('Save changes') : t('Save record')} icon="checkmark" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
