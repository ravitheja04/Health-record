import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { labColors } from '@/components/LabChart';
import { PdfReadError, usePdfReader } from '@/components/PdfReader';
import { Button, Card, ChipSelect, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import * as DB from '@/lib/db';
import { matchMember, parseReport, type ExtractedReport } from '@/lib/extract/parseReport';
import { setPendingImport, titleFor } from '@/lib/extract/pending';
import { attachmentFile, persistPendingFile, type PendingFile } from '@/lib/files';
import { formatDate, todayIso } from '@/lib/format';
import { formatValue } from '@/lib/labAnalysis';
import { showError } from '@/lib/useQuery';
import type { Member } from '@/lib/types';

type Step =
  | { kind: 'start' }
  | { kind: 'reading' }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'done'; report: ExtractedReport };

/**
 * Reads a lab report PDF (Apollo, Tata 1mg and most other labs) and fills in
 * its test results. Two ways in:
 * - no params / memberId: pick a PDF, then a new lab record is created with it;
 * - recordId + attachmentId: read a PDF already attached to a record.
 */
export default function ImportReportScreen() {
  const params = useLocalSearchParams<{ memberId?: string; recordId?: string; attachmentId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const reader = usePdfReader();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [file, setFile] = useState<PendingFile | null>(null);
  const [password, setPassword] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<string | null>(params.memberId ?? null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const forRecord = !!params.recordId;

  const readPdf = reader.read;
  const read = useCallback(
    async (target: PendingFile, pw?: string) => {
      setStep({ kind: 'reading' });
      try {
        const report = parseReport(await readPdf(target.uri, pw));
        setStep({ kind: 'done', report });
        setTitle(titleFor(report));
      } catch (e) {
        if (e instanceof PdfReadError && (e.code === 'password' || e.code === 'wrong-password')) {
          setStep({ kind: 'password', wrong: e.code === 'wrong-password' });
          return;
        }
        setStep({ kind: 'start' });
        showError('Could not read this PDF', e instanceof PdfReadError ? e.message : e);
      }
    },
    [readPdf]
  );

  useEffect(() => {
    (async () => {
      setMembers(await DB.listMembers(db));
      if (params.recordId && params.attachmentId) {
        // A PDF already attached to the record is read straight away.
        const a = (await DB.listAttachments(db, params.recordId)).find((x) => x.id === params.attachmentId);
        if (!a) throw new Error('The PDF is no longer attached to this record.');
        const attached = { uri: attachmentFile(a).uri, name: a.name, mimeType: a.mimeType, size: a.size };
        setFile(attached);
        await read(attached);
      }
    })().catch((e) => showError('Could not load', e));
  }, [db, params.recordId, params.attachmentId, read]);

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    const picked = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size ?? 0 };
    setFile(picked);
    setPassword('');
    read(picked);
  }

  async function save(report: ExtractedReport) {
    if (forRecord && params.recordId) {
      setPendingImport(params.recordId, report);
      router.back();
      return;
    }
    if (!file) return;
    if (!chosenId) return showError('Choose a family member', 'Select whose report this is.');
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id = randomUUID();
      const attachment = await persistPendingFile(id, file);
      await db.withTransactionAsync(async () => {
        await DB.upsertRecord(db, {
          id,
          memberId: chosenId,
          type: 'lab',
          title: title.trim() || 'Lab report',
          date: report.collectedDate ?? report.reportedDate ?? todayIso(),
          doctor: report.doctor ?? '',
          facility: report.labName,
          notes: '',
          createdAt: now,
          updatedAt: now,
        });
        await DB.insertAttachment(db, attachment);
      });
      if (report.rows.length) setPendingImport(id, report);
      router.replace({ pathname: '/record/[id]', params: { id } });
      if (report.rows.length) router.push({ pathname: '/record/results', params: { recordId: id } });
    } catch (e) {
      showError('Could not save the report', e);
      setSaving(false);
    }
  }

  const report = step.kind === 'done' ? step.report : null;
  // Until someone is picked, suggest the member named on the report.
  const chosenId = memberId ?? (report ? (matchMember(report.patientName, members)?.id ?? (members.length === 1 ? members[0].id : null)) : null);
  const member = members.find((m) => m.id === chosenId);
  const nameMismatch = report?.patientName && member && matchMember(report.patientName, [member]) === null;
  const date = report ? (report.collectedDate ?? report.reportedDate) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Read lab report' }} />
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
                <Text style={[styles.title, { flex: 1 }]}>Fill in results from a PDF</Text>
              </View>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                Choose the lab report PDF you downloaded from Apollo 24|7, Tata 1mg or another lab (or got on WhatsApp or email). The app
                reads the test names, values and normal ranges on this phone; nothing is uploaded.
              </Text>
              <Text style={[styles.subtitle, { lineHeight: 19 }]}>You check every value before it’s saved.</Text>
            </Card>
            <Button title="Choose PDF" icon="folder-open-outline" onPress={pick} />
            <Text style={[styles.hint, { textAlign: 'center' }]}>Photos and scanned paper reports can’t be read yet; add those by typing the values.</Text>
          </>
        ) : null}

        {step.kind === 'reading' || (forRecord && step.kind === 'start') ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.subtitle}>Reading {file?.name ?? 'the report'}…</Text>
          </View>
        ) : null}

        {step.kind === 'password' && file ? (
          <Card style={{ gap: 10 }}>
            <View style={styles.row}>
              <Icon name="lock-closed-outline" color={colors.primary} size={24} />
              <Text style={[styles.title, { flex: 1 }]}>This PDF has a password</Text>
            </View>
            <Text style={[styles.subtitle, { lineHeight: 19 }]}>
              Labs often use the patient’s date of birth, mobile number or the first letters of their name. Check the SMS or email the
              report came with.
            </Text>
            {step.wrong ? <Text style={{ color: colors.danger, fontWeight: '600' }}>That password didn’t work. Try again.</Text> : null}
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="PDF password"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              autoFocus
              onSubmitEditing={() => password && read(file, password)}
              style={styles.input}
            />
            <Button title="Open PDF" icon="key-outline" disabled={!password} onPress={() => read(file, password)} />
          </Card>
        ) : null}

        {report ? (
          <>
            {!report.hasText || !report.rows.length ? (
              <Card style={{ gap: 6, borderColor: '#FDBA74', backgroundColor: '#FFF7ED' }}>
                <Text style={[styles.title, { color: '#9A3412' }]}>{report.hasText ? 'No test results found' : 'This PDF is a scanned image'}</Text>
                <Text style={[styles.subtitle, { lineHeight: 19 }]}>
                  {report.hasText
                    ? 'The app couldn’t find a results table in this PDF. You can still save it and type the values.'
                    : 'It has no text to read, only a picture of the page. You can still save it and type the values.'}
                </Text>
              </Card>
            ) : null}

            <Card style={{ gap: 4 }}>
              <Text style={styles.title}>{report.labName || 'Lab report'}</Text>
              {report.patientName ? <Text style={styles.subtitle}>Patient on report: {report.patientName}{report.age ? `, ${report.age} y` : ''}</Text> : null}
              {date ? <Text style={styles.subtitle}>Sample collected {formatDate(date)}</Text> : null}
              {report.rows.length ? (
                <Text style={[styles.subtitle, { fontWeight: '600', color: colors.text }]}>
                  {report.rows.length} result{report.rows.length === 1 ? '' : 's'} found
                </Text>
              ) : null}
            </Card>

            {!forRecord ? (
              <>
                <ChipSelect
                  label="Whose report is this?"
                  options={members.map((m) => m.id)}
                  value={chosenId}
                  onChange={setMemberId}
                  renderLabel={(id) => members.find((m) => m.id === id)?.name.split(' ')[0] ?? ''}
                />
                {nameMismatch ? (
                  <Text style={{ color: '#9A3412', fontWeight: '600' }}>
                    The report is for “{report.patientName}”. Check you picked the right person.
                  </Text>
                ) : null}
                <Field label="Record title" value={title} onChangeText={setTitle} />
              </>
            ) : null}

            {report.rows.length ? (
              <>
                <SectionTitle>Found on the report</SectionTitle>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {report.rows.map((r, i) => (
                    <View
                      key={r.testKey}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.body} numberOfLines={1}>
                          {r.testName}
                        </Text>
                        {r.refLow !== null || r.refHigh !== null ? (
                          <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>
                            Range {r.refLow === null ? `up to ${formatValue(r.refHigh!)}` : r.refHigh === null ? `${formatValue(r.refLow)} or more` : `${formatValue(r.refLow)}–${formatValue(r.refHigh)}`}
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
                    Not numbers, so not added: {report.skipped.map((s) => `${s.name} (${s.value.toLowerCase()})`).join(', ')}.
                  </Text>
                ) : null}
              </>
            ) : null}

            <Button
              title={forRecord ? 'Fill in these values' : report.rows.length ? 'Save and check values' : 'Save PDF as a record'}
              icon="checkmark"
              loading={saving}
              disabled={forRecord && !report.rows.length}
              onPress={() => save(report)}
            />
            {!forRecord ? <Button title="Choose a different PDF" icon="folder-open-outline" variant="secondary" onPress={pick} /> : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
