import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/DateField';
import { Button, Card, colors, Field, Icon, styles } from '@/components/ui';
import { isValidDate, todayIso } from '@/lib/format';
import { requestNotificationPermission, syncRemindersQuietly } from '@/lib/reminders';
import { showError } from '@/lib/useQuery';
import { COMMON_VACCINES } from '@/lib/vaccineSchedules';
import { deleteVaccination, ensureCertificateRecord, getVaccination, upsertVaccination } from '@/lib/vaccines';
import type { Vaccination } from '@/lib/types';
import { t } from '@/i18n';

const DOSE_CHOICES = ['Dose 1', 'Dose 2', 'Dose 3', 'Booster', 'Yearly'];

function blank(memberId: string): Vaccination {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    memberId,
    name: '',
    dose: '',
    dueDate: null,
    givenDate: null,
    facility: '',
    notes: '',
    recordId: null,
    scheduleKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

function QuickChips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable key={o} onPress={() => onPick(o)} style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function EditVaccinationScreen() {
  const params = useLocalSearchParams<{ id?: string; memberId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<Vaccination | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = params.id ? await getVaccination(db, params.id) : null;
      setV(existing ?? blank(params.memberId ?? ''));
    })().catch((e) => showError(t('Could not load vaccination'), e));
  }, [db, params.id, params.memberId]);

  if (!v) return null;
  const set = <K extends keyof Vaccination>(key: K, value: Vaccination[K]) => setV({ ...v, [key]: value });

  function validate(): Vaccination | null {
    if (!v) return null;
    if (!v.name.trim()) {
      Alert.alert(t('Vaccine name required'), t('Enter the vaccine, e.g. MMR or Influenza.'));
      return null;
    }
    if (v.dueDate !== null && !isValidDate(v.dueDate)) {
      Alert.alert(t('Check the due date'), t('Enter it as DD/MM/YYYY, or clear it.'));
      return null;
    }
    if (v.givenDate !== null && !isValidDate(v.givenDate)) {
      Alert.alert(t('Check the date given'), t('Enter it as DD/MM/YYYY, or clear it.'));
      return null;
    }
    if (v.givenDate !== null && v.givenDate > todayIso()) {
      Alert.alert(t('Check the date given'), t('The date given can’t be in the future. Use the due date for planned doses.'));
      return null;
    }
    return { ...v, name: v.name.trim(), dose: v.dose.trim(), facility: v.facility.trim(), updatedAt: new Date().toISOString() };
  }

  async function save() {
    const value = validate();
    if (!value) return;
    setSaving(true);
    try {
      await upsertVaccination(db, value);
      if (!value.givenDate && value.dueDate && value.dueDate >= todayIso()) await requestNotificationPermission();
      syncRemindersQuietly(db);
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
      setSaving(false);
    }
  }

  async function certificate() {
    const value = validate();
    if (!value) return;
    try {
      await upsertVaccination(db, value);
      const recordId = await ensureCertificateRecord(db, value);
      syncRemindersQuietly(db);
      router.replace({ pathname: '/record/edit', params: { id: recordId } });
    } catch (e) {
      showError(t('Could not open certificate'), e);
    }
  }

  function confirmDelete() {
    Alert.alert(t('Delete this vaccination?'), t('A linked certificate record stays in the medical records.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVaccination(db, v!.id);
            syncRemindersQuietly(db);
            router.back();
          } catch (e) {
            showError(t('Could not delete'), e);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: params.id ? 'Edit vaccination' : 'Add vaccination' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={{ gap: 8 }}>
          <Field label={t('Vaccine *')} value={v.name} onChangeText={(t) => set('name', t)} placeholder={t('e.g. Influenza, MMR, Hepatitis B')} />
          <QuickChips options={COMMON_VACCINES} value={v.name} onPick={(t) => set('name', t)} />
        </View>
        <View style={{ gap: 8 }}>
          <Field label={t('Dose')} value={v.dose} onChangeText={(t) => set('dose', t)} placeholder={t('e.g. Dose 2, Booster')} />
          <QuickChips options={DOSE_CHOICES} value={v.dose} onPick={(t) => set('dose', t)} />
        </View>
        <DateField
          label={t('Due date')}
          value={v.dueDate}
          onChange={(d) => set('dueDate', d)}
          hint={t('When this dose should be given. You’ll get a reminder a week before and on the day.')}
        />
        <View style={{ gap: 8 }}>
          <DateField label={t('Date given')} value={v.givenDate} onChange={(d) => set('givenDate', d)} allowFuture={false} />
          {!v.givenDate ? (
            <Pressable onPress={() => set('givenDate', todayIso())} style={[styles.chip, { alignSelf: 'flex-start' }]}>
              <Text style={styles.chipText}>{t('Given today')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Field label={t('Hospital / clinic')} value={v.facility} onChangeText={(t) => set('facility', t)} placeholder={t('Where it was given')} />
        <Field label={t('Notes')} value={v.notes} onChangeText={(t) => set('notes', t)} placeholder={t('Brand, batch number, reactions…')} multiline />

        <Card style={{ gap: 8 }}>
          <View style={styles.row}>
            <Icon name="document-attach-outline" color={colors.primary} />
            <Text style={[styles.title, { flex: 1 }]}>{t('Vaccination certificate')}</Text>
          </View>
          <Text style={styles.subtitle}>
            {v.recordId
              ? t('Linked to a medical record. Open it to add or view photos and PDFs.')
              : t('Keep a photo of the vaccination card or the certificate PDF with this dose.')}
          </Text>
          <Button
            title={v.recordId ? t('Open certificate record') : t('Add certificate')}
            icon={v.recordId ? 'open-outline' : 'camera-outline'}
            variant="secondary"
            onPress={certificate}
          />
        </Card>

        <Button title={params.id ? t('Save changes') : t('Add vaccination')} icon="checkmark" onPress={save} loading={saving} />
        {params.id ? <Button title={t('Delete')} icon="trash-outline" variant="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
