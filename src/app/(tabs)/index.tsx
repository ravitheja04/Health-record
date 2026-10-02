import { router, Tabs } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RecordRow } from '@/components/RecordRow';
import { Avatar, Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers, listRecentRecords } from '@/lib/db';
import { formatDate, todayIso } from '@/lib/format';
import { daysOfSupply, dosesOn, formatTime, needsRefill, nextDose } from '@/lib/medSchedule';
import { listDoseLogs, listMedications, type MedicationWithMember } from '@/lib/meds';
import { useQuery } from '@/lib/useQuery';
import { sortVaccinations, STATUS_STYLE, vaccineDetail, vaccineStatus } from '@/lib/vaccineAnalysis';
import { listVaccinations } from '@/lib/vaccines';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Attention = { key: string; icon: string; tint: string; bg: string; title: string; detail: string; detailColor?: string; onPress: () => void };

export default function HomeScreen() {
  const db = useSQLiteContext();
  const load = useCallback(async () => {
    const today = todayIso();
    const [members, recent, meds, logs, vaccines] = await Promise.all([
      listMembers(db),
      listRecentRecords(db, 5),
      listMedications(db),
      listDoseLogs(db, today),
      listVaccinations(db),
    ]);
    return { members, recent, meds, doses: dosesOn(meds, logs, today), vaccines, today };
  }, [db]);
  const { data } = useQuery(load);

  const header = (
    <Tabs.Screen
      options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 18, marginRight: 16 }}>
            <Pressable accessibilityLabel="Search records" hitSlop={8} onPress={() => router.push('/records')}>
              <Icon name="search-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityLabel="Settings" hitSlop={8} onPress={() => router.push('/settings')}>
              <Icon name="settings-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
        ),
      }}
    />
  );
  if (!data) return header;
  const { members, recent, meds, doses, vaccines, today } = data;

  if (!members.length) {
    return (
      <>
        {header}
        <EmptyState
          icon="people-outline"
          title="Start your family registry"
          message="Add each family member, then keep their reports, medicines, vaccinations and vitals in one place.">
          <Button title="Add family member" icon="person-add-outline" onPress={() => router.push('/member/edit')} />
          <Button title="Import shared records" icon="cloud-download-outline" variant="secondary" onPress={() => router.push('/share')} />
        </EmptyState>
      </>
    );
  }

  const attention: Attention[] = [];
  const late = doses.filter((d) => d.status === 'pending' && d.time < nowTime());
  if (late.length) {
    const first = late[0].med as MedicationWithMember;
    attention.push({
      key: 'doses',
      icon: 'alarm-outline',
      tint: '#C2410C',
      bg: '#FFEDD5',
      title: late.length === 1 ? `${first.memberName} · ${first.name} not marked taken` : `${late.length} doses not marked taken`,
      detail: late.length === 1 ? `Due ${formatTime(late[0].time)}` : 'Tap to tick them off',
      onPress: () => router.push('/medicines'),
    });
  }
  for (const m of meds.filter((x) => needsRefill(x, today))) {
    attention.push({
      key: `refill-${m.id}`,
      icon: 'medkit-outline',
      tint: '#C2410C',
      bg: '#FFEDD5',
      title: `${m.memberName} · refill ${m.name}`,
      detail: `${m.stock} left, about ${daysOfSupply(m)} days`,
      onPress: () => router.push({ pathname: '/medicines/edit', params: { id: m.id } }),
    });
  }
  for (const v of sortVaccinations(vaccines, today).filter((x) => ['overdue', 'due'].includes(vaccineStatus(x, today))).slice(0, 3)) {
    const status = vaccineStatus(v, today);
    attention.push({
      key: `vac-${v.id}`,
      icon: 'shield-checkmark-outline',
      tint: '#1D4ED8',
      bg: '#DBEAFE',
      title: `${v.memberName} · ${v.name}${v.dose ? ` ${v.dose}` : ''}`,
      detail: vaccineDetail(v, today),
      detailColor: STATUS_STYLE[status].color,
      onPress: () => router.push({ pathname: '/vaccines/[memberId]', params: { memberId: v.memberId } }),
    });
  }

  return (
    <>
      {header}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          {DAY_NAMES[new Date().getDay()]}, {formatDate(today)}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${m.name}`}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
              style={{ alignItems: 'center', gap: 6, width: 64 }}>
              <Avatar name={m.name} color={m.color} size={52} />
              <Text style={{ fontSize: 12, color: '#334155' }} numberOfLines={1}>
                {m.name.split(' ')[0]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add family member"
            onPress={() => router.push('/member/edit')}
            style={{ alignItems: 'center', gap: 6, width: 64 }}>
            <View
              style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="add-outline" color="#475569" />
            </View>
            <Text style={{ fontSize: 12, color: '#475569' }}>Add</Text>
          </Pressable>
        </ScrollView>

        <SectionTitle>Needs attention</SectionTitle>
        {attention.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {attention.map((a, i) => (
              <Pressable
                key={a.key}
                accessibilityRole="button"
                onPress={a.onPress}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: '#F1F5F9' },
                  pressed && styles.pressed,
                ]}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={a.icon} color={a.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.title, { fontSize: 15 }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={[styles.subtitle, { marginTop: 0 }, a.detailColor ? { color: a.detailColor } : null]} numberOfLines={1}>
                    {a.detail}
                  </Text>
                </View>
                <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        ) : (
          <Card style={[styles.row, { gap: 10 }]}>
            <Icon name="checkmark-circle-outline" color="#047857" />
            <Text style={[styles.body, { flex: 1 }]}>All caught up. Nothing due right now.</Text>
          </Card>
        )}

        <MedicinesCard data={{ meds, doses, refills: [] }} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} title="Add record" icon="document-text-outline" onPress={() => router.push('/record/edit')} />
          <Button style={{ flex: 1 }} title="Log vitals" icon="pulse-outline" variant="secondary" onPress={() => router.push('/vitals/add')} />
        </View>

        {recent.length > 0 ? (
          <>
            <SectionTitle
              action={
                <Pressable hitSlop={8} onPress={() => router.push('/records')}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>See all</Text>
                </Pressable>
              }>
              Recent records
            </SectionTitle>
            {recent.map((r) => (
              <RecordRow key={r.id} record={r} showMember />
            ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function MedicinesCard({ data }: { data?: { meds: MedicationWithMember[]; doses: ReturnType<typeof dosesOn>; refills: MedicationWithMember[] } }) {
  if (!data) return null;
  const { meds, doses, refills } = data;
  const taken = doses.filter((d) => d.status === 'taken').length;
  const now = new Date();
  const next = nextDose(doses, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const nextMed = next?.med as MedicationWithMember | undefined;
  return (
    <Card onPress={() => router.push('/medicines')} style={{ gap: 10 }}>
      <View style={styles.row}>
        <Icon name="medkit-outline" color="#DB2777" size={24} />
        <Text style={[styles.title, { flex: 1 }]}>{meds.length ? 'Today’s medicines' : 'Medicines & reminders'}</Text>
        {doses.length ? (
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {taken} of {doses.length} taken
          </Text>
        ) : (
          <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
        )}
      </View>
      {doses.length ? (
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${(taken / doses.length) * 100}%`, height: 8, backgroundColor: colors.primary }} />
        </View>
      ) : null}
      <Text style={styles.subtitle}>
        {!meds.length
          ? 'Add the family’s medicines to get dose reminders and refill warnings.'
          : nextMed
            ? `Next: ${nextMed.memberName} · ${nextMed.name} at ${formatTime(next!.time)}`
            : doses.length
              ? 'No more doses due today.'
              : 'No doses due today.'}
      </Text>
      {refills.length ? (
        <Text style={[styles.subtitle, { marginTop: 0, color: '#C2410C', fontWeight: '600' }]}>
          Refill soon: {refills.map((m) => m.name).join(', ')}
        </Text>
      ) : null}
    </Card>
  );
}
