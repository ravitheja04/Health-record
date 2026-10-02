import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/DateField';
import { AddTimeButton } from '@/components/TimePicker';
import { Button, ChipSelect, colors, Field, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { isValidDate, todayIso } from '@/lib/format';
import { parseNumber } from '@/lib/labAnalysis';
import { formatTime } from '@/lib/medSchedule';
import { showError } from '@/lib/useQuery';
import { checkVital, nowMeasuredAt, rangeText, SUGAR_CONTEXTS, vitalDef, VITALS, vitalStatus } from '@/lib/vitalsAnalysis';
import { deleteVital, getVital, upsertVital } from '@/lib/vitals';
import type { Member, Vital, VitalType } from '@/lib/types';

export default function AddVitalScreen() {
  const params = useLocalSearchParams<{ id?: string; memberId?: string; type?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<Member[]>([]);
  const [vital, setVital] = useState<Vital | null>(null);
  const [valueText, setValueText] = useState('');
  const [value2Text, setValue2Text] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setMembers(await listMembers(db));
      const existing = params.id ? await getVital(db, params.id) : null;
      if (existing) {
        setVital(existing);
        setValueText(String(existing.value));
        setValue2Text(existing.value2 === null ? '' : String(existing.value2));
        return;
      }
      const now = new Date().toISOString();
      const type = VITALS.some((v) => v.type === params.type) ? (params.type as VitalType) : 'bp';
      setVital({
        id: randomUUID(),
        memberId: params.memberId ?? '',
        type,
        value: 0,
        value2: null,
        context: type === 'sugar' ? 'fasting' : '',
        measuredAt: nowMeasuredAt(),
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
    })().catch((e) => showError('Could not load reading', e));
  }, [db, params.id, params.memberId, params.type]);

  if (!vital) return null;
  const set = <K extends keyof Vital>(key: K, value: Vital[K]) => setVital({ ...vital, [key]: value });
  const def = vitalDef(vital.type);
  const [date, time] = vital.measuredAt.split('T');
  const value = parseNumber(valueText);
  const value2 = vital.type === 'bp' ? parseNumber(value2Text) : null;
  const preview = value !== null && !checkVital(vital.type, value, value2) ? vitalStatus({ ...vital, value, value2 }) : null;

  async function save() {
    if (!vital) return;
    if (!vital.memberId) return Alert.alert('Choose a family member', 'Select whose reading this is.');
    const problem = checkVital(vital.type, value, value2);
    if (problem) return Alert.alert('Check the reading', problem);
    if (!isValidDate(date)) return Alert.alert('Check the date', 'Enter it as DD/MM/YYYY.');
    if (date > todayIso()) return Alert.alert('Check the date', 'The reading can’t be in the future.');
    setSaving(true);
    try {
      await upsertVital(db, {
        ...vital,
        value: value!,
        value2,
        context: vital.type === 'sugar' ? vital.context : '',
        notes: vital.notes.trim(),
        updatedAt: new Date().toISOString(),
      });
      router.back();
    } catch (e) {
      showError('Could not save reading', e);
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this reading?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVital(db, vital!.id);
            router.back();
          } catch (e) {
            showError('Could not delete', e);
          }
        },
      },
    ]);
  }

  const numberInput = (label: string, text: string, onChange: (t: string) => void, autoFocus = false) => (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        placeholder="—"
        placeholderTextColor="#94A3B8"
        accessibilityLabel={label}
        style={[styles.input, { marginTop: 4, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: params.id ? 'Edit reading' : 'Log a reading' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        {members.length > 1 ? (
          <ChipSelect
            label="Family member"
            options={members.map((m) => m.id)}
            value={vital.memberId || null}
            onChange={(v) => set('memberId', v ?? '')}
            renderLabel={(id) => members.find((m) => m.id === id)?.name.split(' ')[0] ?? ''}
          />
        ) : null}
        <ChipSelect
          label="What did you measure?"
          options={VITALS.map((v) => v.type)}
          value={vital.type}
          onChange={(t) => {
            if (!t) return;
            setVital({ ...vital, type: t, context: t === 'sugar' ? vital.context || 'fasting' : '' });
            setValue2Text('');
          }}
          renderLabel={(t) => vitalDef(t).label}
        />

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
          {vital.type === 'bp' ? (
            <>
              {numberInput('Top (systolic)', valueText, setValueText, !params.id)}
              <Text style={{ fontSize: 24, color: colors.muted, paddingBottom: 12 }}>/</Text>
              {numberInput('Bottom (diastolic)', value2Text, setValue2Text)}
            </>
          ) : (
            numberInput(def.label, valueText, setValueText, !params.id)
          )}
          <Text style={{ fontSize: 15, color: colors.muted, paddingBottom: 14 }}>{def.unit}</Text>
        </View>
        {vital.type === 'sugar' ? (
          <ChipSelect
            label="When was it taken?"
            options={SUGAR_CONTEXTS.map((c) => c.key)}
            value={vital.context}
            onChange={(c) => set('context', c ?? 'random')}
            renderLabel={(c) => SUGAR_CONTEXTS.find((x) => x.key === c)?.label ?? c}
          />
        ) : null}
        <Text style={[styles.hint, preview === 'above' || preview === 'below' ? { color: '#9A3412', fontWeight: '600' } : null]}>
          {preview === 'above'
            ? 'Above the typical range. '
            : preview === 'below'
              ? 'Below the typical range. '
              : preview === 'in'
                ? 'In the typical range. '
                : ''}
          {rangeText(vital.type, vital.context)}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <DateField label="Date" value={date} onChange={(d) => set('measuredAt', `${d ?? ''}T${time}`)} allowFuture={false} />
          </View>
          <View style={{ paddingBottom: 6 }}>
            <AddTimeButton initial={time} label={formatTime(time)} onPick={(t) => set('measuredAt', `${date}T${t}`)} />
          </View>
        </View>

        <Field label="Notes" value={vital.notes} onChangeText={(t) => set('notes', t)} placeholder="e.g. after walk, felt dizzy, home monitor" multiline />

        <Button title={params.id ? 'Save changes' : 'Save reading'} icon="checkmark" onPress={save} loading={saving} />
        {params.id ? <Button title="Delete reading" icon="trash-outline" variant="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
