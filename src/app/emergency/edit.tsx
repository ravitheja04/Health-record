import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, Field, Icon, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { getEmergencyInfo, upsertEmergencyInfo } from '@/lib/emergency';
import { cardContacts, dialable, emptyEmergencyInfo } from '@/lib/emergencyText';
import { showError } from '@/lib/useQuery';
import type { EmergencyContact, EmergencyInfo, Member } from '@/lib/types';
import { t } from '@/i18n';

const MAX_CONTACTS = 3;

export default function EditEmergencyScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [member, setMember] = useState<Member | null>(null);
  const [info, setInfo] = useState<EmergencyInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, existing] = await Promise.all([getMember(db, memberId), getEmergencyInfo(db, memberId)]);
      if (!m) return;
      setMember(m);
      const base = existing ?? emptyEmergencyInfo(memberId);
      // Start from the member's old free-text contact so nothing has to be retyped.
      const contacts = cardContacts(m, existing);
      setInfo({ ...base, contacts: contacts.length ? contacts : [{ name: '', relation: '', phone: '' }] });
    })().catch((e) => showError(t('Could not load emergency card'), e));
  }, [db, memberId]);

  if (!member || !info) return null;
  const set = <K extends keyof EmergencyInfo>(key: K, value: EmergencyInfo[K]) => setInfo({ ...info, [key]: value });
  const setContact = (i: number, patch: Partial<EmergencyContact>) =>
    set('contacts', info.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function save() {
    if (!info) return;
    const contacts = info.contacts
      .map((c) => ({ name: c.name.trim(), relation: c.relation.trim(), phone: c.phone.trim() }))
      .filter((c) => c.name || c.phone);
    const bad = contacts.find((c) => c.phone && !dialable(c.phone));
    if (bad) return Alert.alert(t('Check the phone number'), t('“{phone}” for {name} doesn’t look like a phone number.', { phone: bad.phone, name: bad.name || t('a contact') }));
    if (info.doctorPhone.trim() && !dialable(info.doctorPhone)) {
      return Alert.alert(t('Check the phone number'), t('The doctor’s phone number doesn’t look right.'));
    }
    setSaving(true);
    try {
      await upsertEmergencyInfo(db, {
        ...info,
        contacts,
        doctorName: info.doctorName.trim(),
        doctorPhone: info.doctorPhone.trim(),
        insurer: info.insurer.trim(),
        policyNumber: info.policyNumber.trim(),
        notes: info.notes.trim(),
        updatedAt: new Date().toISOString(),
      });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('{name}’s emergency card', { name: member.name.split(' ')[0] }) }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 14, paddingBottom: insets.bottom + 24 }]}>
        <Card onPress={() => router.push({ pathname: '/member/edit', params: { id: memberId } })}>
          <View style={styles.row}>
            <Icon name="medical-outline" color="#B91C1C" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('Blood group, allergies, conditions')}</Text>
              <Text style={styles.subtitle}>{t('These come from {name}’s profile. Tap to edit them.', { name: member.name.split(' ')[0] })}</Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>

        <SectionTitle>{t('Who to call')}</SectionTitle>
        {info.contacts.map((c, i) => (
          <Card key={i} style={{ gap: 10 }}>
            <View style={[styles.row, { gap: 8 }]}>
              <Text style={[styles.label, { flex: 1 }]}>{t('Contact')}{' '}{i + 1}</Text>
              {info.contacts.length > 1 ? (
                <Pressable
                  accessibilityLabel={t('Remove contact {n}', { n: i + 1 })}
                  hitSlop={10}
                  onPress={() => set('contacts', info.contacts.filter((_, j) => j !== i))}>
                  <Icon name="close-outline" color={colors.muted} size={22} />
                </Pressable>
              ) : null}
            </View>
            <Field label={t('Name')} value={c.name} onChangeText={(t) => setContact(i, { name: t })} placeholder={t('e.g. Ravi')} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('Relation')} value={c.relation} onChangeText={(t) => setContact(i, { relation: t })} placeholder={t('e.g. Son')} />
              </View>
              <View style={{ flex: 1.4 }}>
                <Field
                  label={t('Phone')}
                  value={c.phone}
                  onChangeText={(t) => setContact(i, { phone: t })}
                  placeholder="+91 98765 43210"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </Card>
        ))}
        {info.contacts.length < MAX_CONTACTS ? (
          <Button
            title={t('Add another contact')}
            icon="person-add-outline"
            variant="secondary"
            onPress={() => set('contacts', [...info.contacts, { name: '', relation: '', phone: '' }])}
          />
        ) : null}

        <SectionTitle>{t('Doctor & insurance')}</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Family doctor')} value={info.doctorName} onChangeText={(t) => set('doctorName', t)} placeholder={t('Dr. name')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('Doctor’s phone')} value={info.doctorPhone} onChangeText={(t) => set('doctorPhone', t)} keyboardType="phone-pad" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={t('Health insurance')} value={info.insurer} onChangeText={(t) => set('insurer', t)} placeholder={t('Insurer / TPA')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('Policy number')} value={info.policyNumber} onChangeText={(t) => set('policyNumber', t)} autoCapitalize="characters" />
          </View>
        </View>

        <Field
          label={t('Notes for responders')}
          value={info.notes}
          onChangeText={(t) => set('notes', t)}
          placeholder={t('e.g. Has a pacemaker; diabetic, carries glucose tablets; hearing impaired')}
          multiline
        />

        <Button title={t('Save emergency card')} icon="checkmark" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
