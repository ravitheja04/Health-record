import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, EmptyState, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { formatDate, todayIso } from '@/lib/format';
import { requestNotificationPermission, syncRemindersQuietly } from '@/lib/reminders';
import { showError, useQuery } from '@/lib/useQuery';
import { planFromSchedule } from '@/lib/vaccineAnalysis';
import { SCHEDULES, type VaccineSchedule } from '@/lib/vaccineSchedules';
import { addPlannedDoses, listVaccinations } from '@/lib/vaccines';

export default function ScheduleScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState<VaccineSchedule['key']>('iap');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [member, existing] = await Promise.all([getMember(db, memberId), listVaccinations(db, memberId)]);
    return { member, existing };
  }, [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, existing } = data;
  if (!member) return null;

  if (!member.dob) {
    return (
      <>
        <Stack.Screen options={{ title: 'Vaccination schedule' }} />
        <EmptyState
          icon="calendar-outline"
          title="Date of birth needed"
          message={`Due dates are worked out from ${member.name}’s date of birth. Add it to their profile first.`}>
          <Button title="Add date of birth" icon="create-outline" onPress={() => router.push({ pathname: '/member/edit', params: { id: member.id } })} />
        </EmptyState>
      </>
    );
  }

  const schedule = SCHEDULES.find((s) => s.key === key)!;
  const plan = planFromSchedule(schedule, member.dob, existing).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const today = todayIso();
  const groups: { label: string; items: typeof plan }[] = [];
  for (const p of plan) {
    const last = groups[groups.length - 1];
    if (last && last.label === p.ageLabel && last.items[0].dueDate === p.dueDate) last.items.push(p);
    else groups.push({ label: p.ageLabel, items: [p] });
  }
  const past = plan.filter((p) => p.dueDate < today).length;

  async function add() {
    setSaving(true);
    try {
      await addPlannedDoses(db, memberId, plan);
      if (plan.some((p) => p.dueDate >= today)) await requestNotificationPermission();
      syncRemindersQuietly(db);
      router.back();
    } catch (e) {
      showError('Could not add schedule', e);
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Vaccination schedule' }} />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ gap: 8 }}>
          {SCHEDULES.map((s) => {
            const selected = s.key === key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setKey(s.key)}
                style={[
                  styles.card,
                  { flexDirection: 'row', gap: 12, alignItems: 'center' },
                  selected && { borderColor: colors.primary, borderWidth: 2 },
                ]}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : '#CBD5E1',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{s.title}</Text>
                  <Text style={styles.subtitle}>{s.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          Dates below are typical ages counted from {member.name}’s birth on {formatDate(member.dob)}. Your paediatrician may advise
          different timing or extra vaccines; you can edit or remove any dose later.
        </Text>

        {plan.length === 0 ? (
          <Card>
            <Text style={styles.title}>Already added</Text>
            <Text style={styles.subtitle}>Every dose from this schedule is already in {member.name}’s list.</Text>
          </Card>
        ) : (
          <>
            {groups.map((g) => (
              <Card key={g.label} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.label, { color: colors.muted }]}>{g.label.toUpperCase()}</Text>
                  <Text style={[styles.label, { color: g.items[0].dueDate < today ? '#9A3412' : colors.muted }]}>
                    {formatDate(g.items[0].dueDate)}
                  </Text>
                </View>
                {g.items.map((p) => (
                  <Text key={p.scheduleKey} style={styles.body}>
                    {p.name} <Text style={{ color: colors.muted }}>· {p.dose}</Text>
                  </Text>
                ))}
              </Card>
            ))}
            {past > 0 ? (
              <Text style={[styles.subtitle, { lineHeight: 18 }]}>
                {past} dose{past === 1 ? ' is' : 's are'} already past their date. After adding, use “Mark past doses as given” if they were
                given, or mark them one by one.
              </Text>
            ) : null}
            <Button title={`Add ${plan.length} doses`} icon="checkmark" onPress={add} loading={saving} />
          </>
        )}
      </ScrollView>
    </>
  );
}
