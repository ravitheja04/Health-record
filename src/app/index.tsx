import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow } from '@/components/RecordRow';
import { Avatar, Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers, listRecentRecords } from '@/lib/db';
import { ageFrom, todayIso } from '@/lib/format';
import { dosesOn, formatTime, needsRefill, nextDose } from '@/lib/medSchedule';
import { listDoseLogs, listMedications, type MedicationWithMember } from '@/lib/meds';
import { sortVaccinations, STATUS_STYLE, vaccineDetail, vaccineStatus } from '@/lib/vaccineAnalysis';
import { listVaccinations, type VaccinationWithMember } from '@/lib/vaccines';
import { useQuery } from '@/lib/useQuery';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(async () => {
    const today = todayIso();
    const [members, recent, meds, logs, vaccines] = await Promise.all([
      listMembers(db),
      listRecentRecords(db, 5),
      listMedications(db),
      listDoseLogs(db, today),
      listVaccinations(db),
    ]);
    const vaccinesDue = sortVaccinations(vaccines, today).filter((v) => ['overdue', 'due'].includes(vaccineStatus(v, today)));
    return {
      members,
      recent,
      meds,
      doses: dosesOn(meds, logs, today),
      refills: meds.filter((m) => needsRefill(m, today)),
      vaccinesDue,
    };
  }, [db]);
  const { data } = useQuery(load);
  const members = data?.members ?? [];
  const recent = data?.recent ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Pressable accessibilityLabel="Emergency card" hitSlop={8} onPress={() => router.push('/emergency')}>
                <Icon name="medical" size={22} color="#B91C1C" />
              </Pressable>
              <Pressable accessibilityLabel="Search records" hitSlop={8} onPress={() => router.push('/search')}>
                <Icon name="search-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable accessibilityLabel="Share and sync" hitSlop={8} onPress={() => router.push('/share')}>
                <Icon name="share-social-outline" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {data && members.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Start your family registry"
            message="Add each family member, then store their lab reports, prescriptions, vaccinations and more in one place.">
            <Button title="Add family member" icon="person-add-outline" onPress={() => router.push('/member/edit')} />
            <Button title="Import shared records" icon="cloud-download-outline" variant="secondary" onPress={() => router.push('/share')} />
          </EmptyState>
        ) : null}

        {members.length > 0 ? (
          <>
            <SectionTitle
              action={
                <Pressable hitSlop={8} onPress={() => router.push('/member/edit')}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add</Text>
                </Pressable>
              }>
              Family members
            </SectionTitle>
            {members.map((m) => {
              const age = ageFrom(m.dob);
              const details = [m.relation, age !== null ? `${age} yrs` : null, m.bloodGroup].filter(Boolean).join(' · ');
              return (
                <Card key={m.id} onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}>
                  <View style={styles.row}>
                    <Avatar name={m.name} color={m.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{m.name}</Text>
                      <Text style={styles.subtitle}>{details || 'Family member'}</Text>
                      {m.allergies.trim() ? (
                        <Text style={[styles.subtitle, { color: colors.danger }]} numberOfLines={1}>
                          Allergies: {m.allergies}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.title, { color: colors.primary }]}>{m.recordCount}</Text>
                      <Text style={styles.subtitle}>records</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}

        {members.length > 0 ? <MedicinesCard data={data} /> : null}
        {data?.vaccinesDue.length ? <VaccinesDueCard list={data.vaccinesDue} /> : null}

        {recent.length > 0 ? (
          <>
            <SectionTitle>Recent records</SectionTitle>
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

function VaccinesDueCard({ list }: { list: VaccinationWithMember[] }) {
  const today = todayIso();
  const shown = list.slice(0, 3);
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.row}>
        <Icon name="shield-checkmark-outline" color="#059669" size={24} />
        <Text style={[styles.title, { flex: 1 }]}>Vaccinations due</Text>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>{list.length}</Text>
      </View>
      {shown.map((v) => {
        const status = vaccineStatus(v, today);
        return (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/vaccines/[memberId]', params: { memberId: v.memberId } })}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10 }, pressed && styles.pressed]}>
            <Avatar name={v.memberName} color={v.memberColor} size={28} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.body, { fontWeight: '600' }]} numberOfLines={1}>
                {v.memberName} · {v.name}
                {v.dose ? ` ${v.dose}` : ''}
              </Text>
              <Text style={[styles.subtitle, { marginTop: 0, color: STATUS_STYLE[status].color }]} numberOfLines={1}>
                {vaccineDetail(v, today)}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={16} color={colors.muted} />
          </Pressable>
        );
      })}
      {list.length > shown.length ? <Text style={styles.subtitle}>+ {list.length - shown.length} more</Text> : null}
    </Card>
  );
}
