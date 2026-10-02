import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors } from '@/components/LabChart';
import { StatusChip } from '@/components/LabRows';
import { Button, Card, colors, EmptyState, Icon, InfoRow, SectionTitle, styles } from '@/components/ui';
import { deleteRecord, getMember, getRecord, listAttachments } from '@/lib/db';
import { attachmentFile, formatBytes, removeAttachmentFiles, shareFile } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { formatRange, formatValue, statusOf } from '@/lib/labAnalysis';
import { listResultsForRecord } from '@/lib/labs';
import { getTestDef } from '@/lib/labTests';
import { shareRecordPdf } from '@/lib/share';
import { showError, useQuery } from '@/lib/useQuery';
import { RECORD_TYPES, type Attachment } from '@/lib/types';
import { t } from '@/i18n';

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
      results: record ? await listResultsForRecord(db, id) : [],
    };
  }, [db, id]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { record, member, attachments, results } = data;
  if (!record) {
    return <EmptyState icon="alert-circle-outline" title={t('Record not found')} message={t('This record may have been deleted.')} />;
  }
  const type = RECORD_TYPES[record.type] ?? RECORD_TYPES.other;

  async function openAttachment(a: Attachment) {
    try {
      const file = attachmentFile(a);
      if (!file.exists) throw new Error('The file is missing from this device.');
      await shareFile(file.uri, a.mimeType, a.name);
    } catch (e) {
      showError(t('Could not open file'), e);
    }
  }

  async function sharePdf() {
    setSharing(true);
    try {
      await shareRecordPdf(db, id);
    } catch (e) {
      showError(t('Could not share'), e);
    } finally {
      setSharing(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Delete this record?'), t('The record and its attached files will be removed from this phone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            removeAttachmentFiles(await deleteRecord(db, id));
            router.back();
          } catch (e) {
            showError(t('Could not delete'), e);
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
              accessibilityLabel={t('Edit record')}
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
          <InfoRow icon="person-outline" label={t('Patient')} value={member?.name} />
          <InfoRow icon="calendar-outline" label={t('Date')} value={formatDate(record.date)} />
          <InfoRow icon="pulse-outline" label={t('Doctor')} value={record.doctor} />
          <InfoRow icon="business-outline" label={t('Facility')} value={record.facility} />
        </Card>

        {record.notes.trim() ? (
          <Card>
            <Text style={[styles.label, { marginBottom: 6 }]}>{t('Notes / results')}</Text>
            <Text style={styles.body} selectable>
              {record.notes}
            </Text>
          </Card>
        ) : null}

        {record.type === 'lab' || results.length > 0 ? (
          <>
            <SectionTitle
              action={
                results.length > 0 ? (
                  <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/labs/[memberId]', params: { memberId: record.memberId } })}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('See trends')}</Text>
                  </Pressable>
                ) : undefined
              }>
              {t('Test results ({n})', { n: results.length })}
            </SectionTitle>
            {results.length > 0 ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {results.map((r, i) => {
                  const status = statusOf(r.value, r.refLow, r.refHigh);
                  const out = status === 'high' || status === 'low';
                  const range = formatRange(r.refLow, r.refHigh);
                  return (
                    <Pressable
                      key={r.id}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({ pathname: '/labs/test', params: { memberId: record.memberId, testKey: r.testKey } })
                      }
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderBottomWidth: i === results.length - 1 ? 0 : 1,
                          borderBottomColor: colors.subtle,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[styles.body, { fontWeight: '600' }]}>{getTestDef(r.testKey)?.name ?? r.testName}</Text>
                          <StatusChip status={status} />
                        </View>
                        {range ? <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>{t('Range')}{' '}{range}</Text> : null}
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: out ? labColors.out : colors.text }}>
                        {formatValue(r.value)} <Text style={{ fontSize: 12, fontWeight: '500' }}>{r.unit}</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            ) : (
              <Text style={styles.subtitle}>{t('Type in the values from this report to track them over time.')}</Text>
            )}
            <Button
              title={results.length ? t('Edit test results') : t('Add test results')}
              icon={results.length ? 'create-outline' : 'add-outline'}
              variant="secondary"
              onPress={() => router.push({ pathname: '/record/results', params: { recordId: id } })}
            />
          </>
        ) : null}

        <SectionTitle>{t('Attachments ({n})', { n: attachments.length })}</SectionTitle>
        {attachments.length === 0 ? (
          <Text style={styles.subtitle}>{t('No files attached. Tap the edit icon to add photos or PDFs.')}</Text>
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
                  <Text style={styles.subtitle}>{t('{size} · tap to open or share', { size: formatBytes(a.size) })}</Text>
                </View>
                <Icon name="share-social-outline" color={colors.primary} />
              </View>
            </Card>
          ))
        )}

        <Button title={t('Share as PDF')} icon="document-outline" onPress={sharePdf} loading={sharing} style={{ marginTop: 8 }} />
        <Button title={t('Delete record')} icon="trash-outline" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </>
  );
}
