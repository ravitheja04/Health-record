import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/DateField';
import { AddTimeButton } from '@/components/TimePicker';
import { Button, ChipSelect, colors, Field, Icon, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { formatDate, isValidDate, todayIso } from '@/lib/format';
import { parseNumber } from '@/lib/labAnalysis';
import { daysOfSupply, formatTime, INSTRUCTIONS, WEEKDAYS } from '@/lib/medSchedule';
import { deleteMedication, getMedication, upsertMedication } from '@/lib/meds';
import { requestNotificationPermission, syncRemindersQuietly } from '@/lib/reminders';
import { showError } from '@/lib/useQuery';
import type { Medication, Member } from '@/lib/types';
import { t } from '@/i18n';

const PRESET_TIMES = [
  { label: 'Morning', time: '08:00' },
  { label: 'Afternoon', time: '14:00' },
  { label: 'Night', time: '21:00' },
];

function blank(memberId: string): Medication {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    memberId,
    name: '',
    dose: '',
    instructions: '',
    times: [],
    frequency: 'daily',
    days: [],
    startDate: todayIso(),
    endDate: null,
    stock: null,
    perDose: 1,
    remindersOn: true,
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export default function EditMedicineScreen() {
  const params = useLocalSearchParams<{ id?: string; memberId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<Member[]>([]);
  const [med, setMed] = useState<Medication | null>(null);
  const [stockText, setStockText] = useState('');
  const [perDoseText, setPerDoseText] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await listMembers(db);
      setMembers(all);
      const existing = params.id ? await getMedication(db, params.id) : null;
      const m = existing ?? blank(params.memberId ?? (all.length === 1 ? all[0].id : ''));
      setMed(m);
      setStockText(m.stock === null ? '' : String(m.stock));
      setPerDoseText(String(m.perDose));
    })().catch((e) => showError(t('Could not load medicine'), e));
  }, [db, params.id, params.memberId]);

  if (!med) return null;
  const set = <K extends keyof Medication>(key: K, value: Medication[K]) => setMed({ ...med, [key]: value });
  const addTime = (time: string) => {
    if (!med.times.includes(time)) set('times', [...med.times, time].sort());
  };
  const toggleDay = (day: number) =>
    set('days', med.days.includes(day) ? med.days.filter((d) => d !== day) : [...med.days, day]);

  async function save(overrides: Partial<Medication> = {}) {
    if (!med) return;
    const m = { ...med, ...overrides };
    if (!m.memberId) return Alert.alert(t('Choose a family member'), t('Select who takes this medicine.'));
    if (!m.name.trim()) return Alert.alert(t('Name required'), t('Enter the medicine’s name, e.g. Metformin.'));
    if (m.times.length === 0) return Alert.alert(t('Add a time'), t('Add at least one time of day to take it.'));
    if (m.frequency === 'weekly' && m.days.length === 0) return Alert.alert(t('Choose days'), t('Pick the days of the week to take it.'));
    if (!isValidDate(m.startDate)) return Alert.alert(t('Check the start date'), t('Enter it as DD/MM/YYYY.'));
    if (m.endDate !== null && !isValidDate(m.endDate)) return Alert.alert(t('Check the end date'), t('Enter it as DD/MM/YYYY, or clear it.'));
    if (m.endDate !== null && m.endDate < m.startDate) return Alert.alert(t('Check the dates'), t('The last day is before the start date.'));
    const stock = stockText.trim() ? parseNumber(stockText) : null;
    const perDose = parseNumber(perDoseText);
    if (stockText.trim() && (stock === null || stock < 0)) return Alert.alert(t('Check the stock'), t('Tablets left must be a number.'));
    if (perDose === null || perDose <= 0) return Alert.alert(t('Check the dose'), t('Tablets per dose must be a number above 0.'));

    setSaving(true);
    try {
      await upsertMedication(db, { ...m, name: m.name.trim(), dose: m.dose.trim(), stock, perDose, updatedAt: new Date().toISOString() });
      if (m.remindersOn && !(await requestNotificationPermission())) {
        Alert.alert(
          t('Reminders are off'),
          t('Notifications are turned off for this app. Turn them on in your phone’s Settings to get medicine reminders.')
        );
      }
      syncRemindersQuietly(db);
      router.back();
    } catch (e) {
      showError(t('Could not save medicine'), e);
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Delete this medicine?'), t('Its reminders and dose history will be removed. To keep the history, use “Stop taking” instead.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMedication(db, med!.id);
            syncRemindersQuietly(db);
            router.back();
          } catch (e) {
            showError(t('Could not delete'), e);
          }
        },
      },
    ]);
  }

  const stockPreview = (() => {
    const stock = stockText.trim() ? parseNumber(stockText) : null;
    const perDose = parseNumber(perDoseText);
    if (stock === null || perDose === null || perDose <= 0) return null;
    const days = daysOfSupply({ ...med, stock, perDose });
    return days === null ? null : `Lasts about ${days} day${days === 1 ? '' : 's'} at this schedule.`;
  })();
  const stopped = med.endDate !== null && med.endDate < todayIso();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: params.id ? 'Edit medicine' : 'Add medicine' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <ChipSelect
          label={t('Family member *')}
          options={members.map((m) => m.id)}
          value={med.memberId || null}
          onChange={(v) => set('memberId', v ?? '')}
          renderLabel={(id) => members.find((m) => m.id === id)?.name ?? ''}
        />
        <Field label={t('Medicine name *')} value={med.name} onChangeText={(v) => set('name', v)} placeholder={t('e.g. Metformin')} autoFocus={!params.id} />
        <Field label={t('Dose')} value={med.dose} onChangeText={(v) => set('dose', v)} placeholder={t('e.g. 500 mg, 1 tablet, 5 ml')} />
        <ChipSelect
          label={t('When to take it')}
          options={INSTRUCTIONS}
          value={INSTRUCTIONS.includes(med.instructions) ? med.instructions : null}
          onChange={(v) => set('instructions', v ?? '')}
          renderLabel={(v) => t(v)}
        />

        <View style={styles.field}>
          <Text style={styles.label}>{t('Times of day *')}</Text>
          <View style={styles.chips}>
            {med.times.map((time) => (
              <Pressable
                key={time}
                accessibilityRole="button"
                accessibilityLabel={t('Remove {time}', { time: formatTime(time) })}
                onPress={() => set('times', med.times.filter((x) => x !== time))}
                style={[styles.chip, styles.chipSelected, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Text style={[styles.chipText, styles.chipTextSelected]}>{formatTime(time)}</Text>
                <Icon name="close-outline" size={16} color="#FFFFFF" />
              </Pressable>
            ))}
            {PRESET_TIMES.filter((p) => !med.times.includes(p.time)).map((p) => (
              <Pressable key={p.time} accessibilityRole="button" onPress={() => addTime(p.time)} style={styles.chip}>
                <Text style={styles.chipText}>
                  + {t(p.label)} {formatTime(p.time)}
                </Text>
              </Pressable>
            ))}
            <AddTimeButton onPick={addTime} label={t('+ Other time')} />
          </View>
        </View>

        <ChipSelect
          label={t('How often')}
          options={['daily', 'weekly'] as const}
          value={med.frequency}
          onChange={(v) => set('frequency', v ?? 'daily')}
          renderLabel={(v) => (v === 'daily' ? 'Every day' : 'Some days of the week')}
        />
        {med.frequency === 'weekly' ? (
          <View style={styles.chips}>
            {WEEKDAYS.map((w) => {
              const on = med.days.includes(w.day);
              return (
                <Pressable
                  key={w.day}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleDay(w.day)}
                  style={[styles.chip, on && styles.chipSelected, { minWidth: 48, alignItems: 'center' }]}>
                  <Text style={[styles.chipText, on && styles.chipTextSelected]}>{w.short}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <DateField label={t('Start date')} value={med.startDate} onChange={(v) => set('startDate', v ?? '')} />
        <DateField
          label={t('Last day (optional)')}
          value={med.endDate}
          onChange={(v) => set('endDate', v)}
          hint={t('Leave empty for medicines taken long term. For a course, e.g. 5 days of antibiotics, enter the last day.')}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Tablets left')} value={stockText} onChangeText={setStockText} keyboardType="decimal-pad" placeholder={t('Not tracked')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('Tablets per dose')} value={perDoseText} onChangeText={setPerDoseText} keyboardType="decimal-pad" />
          </View>
        </View>
        <Text style={[styles.hint, { marginTop: -8 }]}>
          {stockPreview ?? t('Optional. The count goes down as doses are marked taken, and you get a refill warning a few days before it runs out.')}
        </Text>

        <View style={[styles.row, { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('Remind me on this phone')}</Text>
            <Text style={styles.subtitle}>{t('A notification at each time above')}</Text>
          </View>
          <Switch
            value={med.remindersOn}
            onValueChange={(v) => set('remindersOn', v)}
            accessibilityLabel={t('Remind me on this phone')}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>

        <Field label={t('Notes')} value={med.notes} onChangeText={(v) => set('notes', v)} placeholder={t('Prescribed by, purpose, side effects to watch…')} multiline />

        <Button title={params.id ? t('Save changes') : t('Add medicine')} icon="checkmark" onPress={() => save()} loading={saving} />
        {params.id && !stopped ? (
          <Button
            title={t('Stop taking')}
            icon="stop-circle-outline"
            variant="secondary"
            onPress={() =>
              Alert.alert(t('Stop this medicine?'), t('It will end today ({date}) and its reminders stop. History is kept.', { date: formatDate(todayIso()) }), [
                { text: t('Cancel'), style: 'cancel' },
                { text: t('Stop'), onPress: () => save({ endDate: todayIso() }) },
              ])
            }
          />
        ) : null}
        {params.id ? <Button title={t('Delete medicine')} icon="trash-outline" variant="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
