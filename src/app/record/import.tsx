import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors } from '@/components/LabChart';
import { PdfReadError, usePdfReader } from '@/components/PdfReader';
import { OcrUnavailableError, recognizeImages } from '@/components/ReportOcr';
import { Button, Card, ChipSelect, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import * as DB from '@/lib/db';
import { matchMember, parseReport, type ExtractedReport } from '@/lib/extract/parseReport';
import { findDuplicateReport } from '@/lib/extract/duplicates';
import { setPendingImport, titleFor } from '@/lib/extract/pending';
import { attachmentFile, persistPendingFile, type PendingFile } from '@/lib/files';
import { formatDate, todayIso } from '@/lib/format';
import { formatValue } from '@/lib/labAnalysis';
import { showError } from '@/lib/useQuery';
import type { Attachment, Member } from '@/lib/types';
import { t, tn } from '@/i18n';

type Step =
  | { kind: 'start' }
  | { kind: 'reading'; message: string }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'done'; report: ExtractedReport };

const isPdf = (f: PendingFile) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name);

function fromAsset(a: ImagePicker.ImagePickerAsset, n: number): PendingFile {
  return { uri: a.uri, name: a.fileName ?? `report-page-${n}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 };
}

/**
 * Reads a lab report (Apollo, Tata 1mg and most other labs) and fills in its
 * test results: a text PDF directly, photos and scanned PDFs by on-device OCR.
 * Two ways in:
 * - no params / memberId: pick a PDF or photos; a new lab record is created;
 * - recordId + attachmentId: read a PDF or photo already attached to a record.
 */
export default function ImportReportScreen() {
  const params = useLocalSearchParams<{ memberId?: string; recordId?: string; attachmentId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const reader = usePdfReader();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  /** One PDF, or one photo per page. */
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [password, setPassword] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<string | null>(params.memberId ?? null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const forRecord = !!params.recordId;

  const { read: readPdf, renderPages } = reader;
  const read = useCallback(
    async (targets: PendingFile[], pw?: string) => {
      const pdf = targets.length === 1 && isPdf(targets[0]);
      const photos = `${targets.length} photo${targets.length === 1 ? '' : 's'}`;
      setStep({ kind: 'reading', message: pdf ? t('Reading {name}…', { name: targets[0].name }) : t('Reading {photos}…', { photos }) });
      try {
        let report: ExtractedReport;
        if (pdf) {
          report = parseReport(await readPdf(targets[0].uri, pw));
          if (!report.hasText) {
            // No text layer: a scanned paper report. Read the page images instead.
            setStep({ kind: 'reading', message: t('This PDF is a scan. Reading the page images…') });
            report = parseReport(await recognizeImages(await renderPages(targets[0].uri, pw)), 'ocr');
          }
        } else {
          report = parseReport(await recognizeImages(targets.map((t) => t.uri)), 'ocr');
        }
        setStep({ kind: 'done', report });
        setTitle(titleFor(report));
      } catch (e) {
        if (e instanceof PdfReadError && (e.code === 'password' || e.code === 'wrong-password')) {
          setStep({ kind: 'password', wrong: e.code === 'wrong-password' });
          return;
        }
        setStep({ kind: 'start' });
        if (e instanceof OcrUnavailableError) showError(t('Can’t read photos here'), e);
        else showError(pdf ? 'Could not read this PDF' : 'Could not read the photos', e);
      }
    },
    [readPdf, renderPages]
  );

  useEffect(() => {
    (async () => {
      setMembers(await DB.listMembers(db));
      if (params.recordId && params.attachmentId) {
        // A report already attached to the record is read straight away.
        const a = (await DB.listAttachments(db, params.recordId)).find((x) => x.id === params.attachmentId);
        if (!a) throw new Error('The report is no longer attached to this record.');
        const attached = [{ uri: attachmentFile(a).uri, name: a.name, mimeType: a.mimeType, size: a.size }];
        setFiles(attached);
        await read(attached);
      }
    })().catch((e) => showError(t('Could not load'), e));
  }, [db, params.recordId, params.attachmentId, read]);

  function start(next: PendingFile[]) {
    setFiles(next);
    setPassword('');
    read(next);
  }

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    start([{ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size ?? 0 }]);
  }

  /** `more` adds pages to the photos already taken. */
  async function takePhoto(more: boolean) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('Camera not allowed'), t('Allow camera access in your phone’s settings to photograph reports.'));
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled) return;
    const base = more ? files : [];
    start([...base, fromAsset(res.assets[0], base.length + 1)]);
  }

  async function choosePhotos(more: boolean) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    const base = more ? files : [];
    start([...base, ...res.assets.map((a, i) => fromAsset(a, base.length + i + 1))]);
  }

  function addPage() {
    Alert.alert(t('Add another page'), t('Pages are read in the order you add them.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('From gallery'), onPress: () => choosePhotos(true) },
      { text: t('Take photo'), onPress: () => takePhoto(true) },
    ]);
  }

  async function save(report: ExtractedReport, checked = false) {
    if (forRecord && params.recordId) {
      setPendingImport(params.recordId, report);
      router.back();
      return;
    }
    if (!files.length) return;
    if (!chosenId) return showError(t('Choose a family member'), t('Select whose report this is.'));
    const date = report.collectedDate ?? report.reportedDate ?? todayIso();
    if (!checked && report.rows.length) {
      const existing = await findDuplicateReport(db, chosenId, date, report.rows).catch(() => null);
      if (existing) {
        Alert.alert(t('Already saved?'), t('This looks like “{title}” from {date}, which has the same results.', { title: existing.title, date: formatDate(existing.date) }), [
          { text: t('Open saved report'), onPress: () => router.replace({ pathname: '/record/[id]', params: { id: existing.id } }) },
          { text: t('Save anyway'), onPress: () => save(report, true) },
          { text: t('Cancel'), style: 'cancel' },
        ]);
        return;
      }
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id = randomUUID();
      const attachments: Attachment[] = [];
      for (const f of files) attachments.push(await persistPendingFile(id, f));
      await db.withTransactionAsync(async () => {
        await DB.upsertRecord(db, {
          id,
          memberId: chosenId,
          type: 'lab',
          title: title.trim() || 'Lab report',
          date,
          doctor: report.doctor ?? '',
          facility: report.labName,
          notes: '',
          createdAt: now,
          updatedAt: now,
        });
        for (const a of attachments) await DB.insertAttachment(db, a);
      });
      if (report.rows.length) setPendingImport(id, report);
      router.replace({ pathname: '/record/[id]', params: { id } });
      if (report.rows.length) router.push({ pathname: '/record/results', params: { recordId: id } });
    } catch (e) {
      showError(t('Could not save the report'), e);
      setSaving(false);
    }
  }

  const report = step.kind === 'done' ? step.report : null;
  // Until someone is picked, suggest the member named on the report.
  const chosenId = memberId ?? (report ? (matchMember(report.patientName, members)?.id ?? (members.length === 1 ? members[0].id : null)) : null);
  const member = members.find((m) => m.id === chosenId);
  const nameMismatch = report?.patientName && member && matchMember(report.patientName, [member]) === null;
  const date = report ? (report.collectedDate ?? report.reportedDate) : null;
  const photoMode = files.length > 0 && !files.some(isPdf);
  const pdfFile = files.length === 1 && isPdf(files[0]) ? files[0] : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Read lab report') }} />
      {reader.element}
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 14, paddingBottom: insets.bottom + 24 }]}>
        {step.kind === 'start' && !forRecord ? (
          <>
            <Card style={{ gap: 8 }}>
              <View style={styles.row}>
                <Icon name="document-text-outline" color={colors.primary} size={26} />
                <Text style={[styles.title, { flex: 1 }]}>{t('Fill in results from a report')}</Text>
              </View>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                {t('Choose the lab report PDF you downloaded from Apollo 24|7, Tata 1mg or another lab (or got on WhatsApp or email), or photograph a paper report. The app reads the test names, values and normal ranges on this phone; nothing is uploaded.')}
              </Text>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>{t('You check every value before it’s saved.')}</Text>
            </Card>
            <Button title={t('Choose PDF')} icon="folder-open-outline" onPress={pick} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} title={t('Take photo')} icon="camera-outline" variant="secondary" onPress={() => takePhoto(false)} />
              <Button style={{ flex: 1 }} title={t('Choose photos')} icon="images-outline" variant="secondary" onPress={() => choosePhotos(false)} />
            </View>
            <Text style={[styles.hint, { lineHeight: 18 }]}>
              {t('For photos: lay the page flat in good light, avoid shadows and glare, and fill the frame with the results table. One photo per page. A PDF from the lab is always more exact than a photo.')}
            </Text>
          </>
        ) : null}

        {step.kind === 'reading' || (forRecord && step.kind === 'start') ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>{step.kind === 'reading' ? step.message : t('Reading the report…')}</Text>
          </View>
        ) : null}

        {step.kind === 'password' && pdfFile ? (
          <Card style={{ gap: 10 }}>
            <View style={styles.row}>
              <Icon name="lock-closed-outline" color={colors.primary} size={24} />
              <Text style={[styles.title, { flex: 1 }]}>{t('This PDF has a password')}</Text>
            </View>
            <Text style={[styles.subtitle, { lineHeight: 19 }]}>
              {t('Labs often use the patient’s date of birth, mobile number or the first letters of their name. Check the SMS or email the report came with.')}
            </Text>
            {step.wrong ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{t('That password didn’t work. Try again.')}</Text> : null}
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('PDF password')}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              autoFocus
              onSubmitEditing={() => password && read([pdfFile], password)}
              style={styles.input}
            />
            <Button title={t('Open PDF')} icon="key-outline" disabled={!password} onPress={() => read([pdfFile], password)} />
          </Card>
        ) : null}

        {report ? (
          <>
            {!report.hasText || !report.rows.length ? (
              <Card style={{ gap: 6, borderColor: colors.warnBorder, backgroundColor: colors.warnBg }}>
                <Text style={[styles.title, { color: colors.warnText }]}>{report.hasText ? t('No test results found') : t('No text could be read')}</Text>
                <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                  {report.source === 'ocr'
                    ? t('Try a sharper photo: flat page, good light, the results table filling the frame. Or save it and type the values.')
                    : t('The app couldn’t find a results table in this PDF. You can still save it and type the values.')}
                </Text>
              </Card>
            ) : report.source === 'ocr' ? (
              <Card style={{ gap: 4, borderColor: colors.cautionBorder, backgroundColor: colors.cautionBg }}>
                <Text style={[styles.title, { color: colors.cautionText }]}>{photoMode ? t('Read from a photo') : t('Read from a scanned page')}</Text>
                <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                  {t('Photos are less exact than PDFs: a smudge can turn 6.8 into 5.8. Check every value against the paper before saving.')}
                </Text>
              </Card>
            ) : null}

            <Card style={{ gap: 4 }}>
              <Text style={styles.title}>{report.labName || t('Lab report')}</Text>
              {report.patientName ? <Text style={styles.subtitle}>{t('Patient on report: {name}', { name: `${report.patientName}${report.age ? `, ${report.age} y` : ''}` })}</Text> : null}
              {date ? <Text style={styles.subtitle}>{t('Sample collected {date}', { date: formatDate(date) })}</Text> : null}
              {report.rows.length ? (
                <Text style={[styles.subtitle, { fontWeight: '600', color: colors.text }]}>
                  {tn(report.rows.length, '{n} result found', '{n} results found')}
                </Text>
              ) : null}
            </Card>

            {!forRecord ? (
              <>
                <ChipSelect
                  label={t('Whose report is this?')}
                  options={members.map((m) => m.id)}
                  value={chosenId}
                  onChange={setMemberId}
                  renderLabel={(id) => members.find((m) => m.id === id)?.name.split(' ')[0] ?? ''}
                />
                {nameMismatch ? (
                  <Text style={{ color: colors.warnText, fontWeight: '600' }}>
                    {t('The report is for “{name}”. Check you picked the right person.', { name: report.patientName ?? '' })}
                  </Text>
                ) : null}
                <Field label={t('Record title')} value={title} onChangeText={setTitle} />
              </>
            ) : null}

            {report.rows.length ? (
              <>
                <SectionTitle>{t('Found on the report')}</SectionTitle>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {report.rows.map((r, i) => (
                    <View
                      key={r.testKey}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.body} numberOfLines={1}>
                          {r.testName}
                        </Text>
                        {r.refLow !== null || r.refHigh !== null ? (
                          <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>
                            {t('Range')}{' '}{r.refLow === null ? `up to ${formatValue(r.refHigh!)}` : r.refHigh === null ? t('{n} or more', { n: formatValue(r.refLow) }) : `${formatValue(r.refLow)}–${formatValue(r.refHigh)}`}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontWeight: '700', color: r.flag ? labColors.out : colors.text }}>
                        {r.valueText} <Text style={{ fontWeight: '400', fontSize: 12, color: colors.muted }}>{r.unit}</Text>
                      </Text>
                    </View>
                  ))}
                </Card>
                {report.skipped.length ? (
                  <Text style={[styles.hint, { lineHeight: 18 }]}>
                    {t('Not numbers, so not added: {list}.', { list: report.skipped.map((s) => `${s.name} (${s.value.toLowerCase()})`).join(', ') })}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Button
              title={forRecord ? t('Fill in these values') : report.rows.length ? t('Save and check values') : photoMode ? t('Save photos as a record') : t('Save PDF as a record')}
              icon="checkmark"
              loading={saving}
              disabled={forRecord && !report.rows.length}
              onPress={() => save(report)}
            />
            {!forRecord && photoMode ? (
              <Button title={t('Add another page ({n} so far)', { n: files.length })} icon="add-outline" variant="secondary" onPress={addPage} />
            ) : null}
            {!forRecord ? <Button title={t('Start again')} icon="refresh-outline" variant="secondary" onPress={() => setStep({ kind: 'start' })} /> : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
