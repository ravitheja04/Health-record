import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/DateField';
import { Button, ChipSelect, colors, Field, styles } from '@/components/ui';
import { getMember, upsertMember } from '@/lib/db';
import { isValidDate, todayIso } from '@/lib/format';
import { showError } from '@/lib/useQuery';
import { BLOOD_GROUPS, GENDERS, MEMBER_COLORS, RELATIONS, type Member } from '@/lib/types';

function blankMember(): Member {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: '',
    relation: 'Self',
    dob: null,
    gender: null,
    bloodGroup: null,
    allergies: '',
    conditions: '',
    medications: '',
    emergencyContact: '',
    notes: '',
    color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
    createdAt: now,
    updatedAt: now,
  };
}

export default function EditMemberScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [member, setMember] = useState<Member | null>(id ? null : blankMember());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getMember(db, id).then((m) => setMember(m ?? blankMember()));
  }, [db, id]);

  if (!member) return null;
  const set = <K extends keyof Member>(key: K, value: Member[K]) => setMember({ ...member, [key]: value });

  async function save() {
    if (!member) return;
    if (!member.name.trim()) return Alert.alert('Name required', 'Please enter the family member’s name.');
    if (member.dob && !isValidDate(member.dob)) {
      return Alert.alert('Check date of birth', 'Enter it as DD/MM/YYYY, for example 23/04/1988, or pick it from the calendar.');
    }
    if (member.dob && member.dob > todayIso()) {
      return Alert.alert('Check date of birth', 'The date of birth can’t be in the future.');
    }
    setSaving(true);
    try {
      await upsertMember(db, { ...member, name: member.name.trim(), updatedAt: new Date().toISOString() });
      if (id) router.back();
      else router.replace({ pathname: '/member/[id]', params: { id: member.id } });
    } catch (e) {
      showError('Could not save', e);
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Edit member' : 'New family member' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <Field label="Full name *" value={member.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Priya Sharma" autoFocus={!id} />
        <ChipSelect label="Relation" options={RELATIONS} value={member.relation} onChange={(v) => set('relation', v ?? '')} />
        <DateField label="Date of birth" value={member.dob} onChange={(v) => set('dob', v)} pickYearFirst allowFuture={false} />
        <ChipSelect label="Gender" options={GENDERS} value={member.gender} onChange={(v) => set('gender', v)} />
        <ChipSelect label="Blood group" options={BLOOD_GROUPS} value={member.bloodGroup} onChange={(v) => set('bloodGroup', v)} />
        <Field
          label="Allergies"
          value={member.allergies}
          onChangeText={(v) => set('allergies', v)}
          placeholder="e.g. Penicillin, peanuts"
          multiline
          hint="Shown prominently on the profile and in shared PDFs."
        />
        <Field label="Medical conditions" value={member.conditions} onChangeText={(v) => set('conditions', v)} placeholder="e.g. Type 2 diabetes, asthma" multiline />
        <Field label="Current medications" value={member.medications} onChangeText={(v) => set('medications', v)} placeholder="e.g. Metformin 500mg twice daily" multiline />
        <Field
          label="Emergency contact"
          value={member.emergencyContact}
          onChangeText={(v) => set('emergencyContact', v)}
          placeholder="Name and phone number"
        />
        <Field label="Notes" value={member.notes} onChangeText={(v) => set('notes', v)} placeholder="Insurance ID, family doctor, anything else" multiline />

        <View style={styles.field}>
          <Text style={styles.label}>Profile colour</Text>
          <View style={styles.chips}>
            {MEMBER_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={`Colour ${c}`}
                onPress={() => set('color', c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: c,
                  borderWidth: 3,
                  borderColor: member.color === c ? colors.text : 'transparent',
                }}
              />
            ))}
          </View>
        </View>

        <Button title={id ? 'Save changes' : 'Add member'} icon="checkmark" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
