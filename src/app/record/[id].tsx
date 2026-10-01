import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, EmptyState, Icon, InfoRow, SectionTitle, styles } from '@/components/ui';
import { deleteRecord, getMember, getRecord, listAttachments } from '@/lib/db';
import { attachmentFile, formatBytes, removeAttachmentFiles, shareFile } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { shareRecordPdf } from '@/lib/share';
import { showError, useQuery } from '@/lib/useQuery';
import { RECORD_TYPES, type Attachment } from '@/lib/types';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const load = useCallback(async () => {
    const record = await getRecord(db, id);
    return {
      record,
      member: record ? await getMember(db, record.memberId) : null,
      attachments: record ? await listAttachments(db, id) : [],
    };
  }, [db, id]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { record, member, attachments } = data;
  if (!record) {
    return <EmptyState icon="alert-circle-outline" title="Record not found" message="This record may have been deleted." />;
  }
  const type = RECORD_TYPES[record.type] ?? RECORD_TYPES.other;

  async function openAttachment(a: Attachment) {
    try {
      const file = attachmentFile(a);
      if (!file.exists) throw new Error('The file is missing from this device.');
      await shareFile(file.uri, a.mimeType, a.name);
    } catch (e) {
      showError('Could not open file', e);
    }
  }

  async function sharePdf() {
    setSharing(true);
    try {
      await shareRecordPdf(db, id);
    } catch (e) {
      showError('Could not share', e);
    } finally {
      setSharing(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this record?', 'The record and its attached files will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            removeAttachmentFiles(await deleteRecord(db, id));
            router.back();
          } catch (e) {
            showError('Could not delete', e);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: type.label,
          headerRight: () => (
            <Pressable
              accessibilityLabel="Edit record"
              hitSlop={8}
              onPress={() => router.push({ pathname: '/record/edit', params: { id } })}>
              <Icon name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card>
          <View style={[styles.row, { marginBottom: 8 }]}>
            <Icon name={type.icon} color={type.color} size={26} />
            <Text style={[styles.title, { fontSize: 20, flex: 1 }]} selectable>
              {record.title}
            </Text>
          </View>
          <InfoRow icon="person-outline" label="Patient" value={member?.name} />
          <InfoRow icon="calendar-outline" label="Date" value={formatDate(record.date)} />
          <InfoRow icon="pulse-outline" label="Doctor" value={record.doctor} />
          <InfoRow icon="business-outline" label="Facility" value={record.facility} />
        </Card>

        {record.notes.trim() ? (
          <Card>
            <Text style={[styles.label, { marginBottom: 6 }]}>Notes / results</Text>
            <Text style={styles.body} selectable>
              {record.notes}
            </Text>
          </Card>
        ) : null}

        <SectionTitle>Attachments ({attachments.length})</SectionTitle>
        {attachments.length === 0 ? (
          <Text style={styles.subtitle}>No files attached. Tap the edit icon to add photos or PDFs.</Text>
        ) : (
          attachments.map((a) => (
            <Card key={a.id} onPress={() => openAttachment(a)}>
              {a.mimeType.startsWith('image/') ? (
                <Image
                  source={{ uri: attachmentFile(a).uri }}
                  style={{ width: '100%', height: 220, borderRadius: 8, marginBottom: 10, backgroundColor: colors.bg }}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.row}>
                <Icon name={a.mimeType.startsWith('image/') ? 'image-outline' : 'document-outline'} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.body} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={styles.subtitle}>{formatBytes(a.size)} · tap to open or share</Text>
                </View>
                <Icon name="share-social-outline" color={colors.primary} />
              </View>
            </Card>
          ))
        )}

        <Button title="Share as PDF" icon="document-outline" onPress={sharePdf} loading={sharing} style={{ marginTop: 8 }} />
        <Button title="Delete record" icon="trash-outline" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </>
  );
}
