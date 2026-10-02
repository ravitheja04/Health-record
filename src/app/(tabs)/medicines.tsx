import { router, Tabs, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { formatDate, todayIso } from '@/lib/format';
import {
  daysOfSupply,
  dosesOn,
  formatTime,
  isCurrent,
  needsRefill,
  scheduleText,
  SLOT_LABELS,
  slotOf,
  type Dose,
  type DoseSlot,
} from '@/lib/medSchedule';
import { listDoseLogs, listMedications, setDoseStatus, type MedicationWithMember } from '@/lib/meds';
import { hasNotificationPermission, requestNotificationPermission, syncRemindersQuietly } from '@/lib/reminders';
import { showError, useQuery } from '@/lib/useQuery';
import type { DoseStatus } from '@/lib/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function DoseRow({ dose, onSet, last }: { dose: Dose; onSet: (status: DoseStatus | null) => void; last: boolean }) {
  const med = dose.med as MedicationWithMember;
  const taken = dose.status === 'taken';
  const skipped = dose.status === 'skipped';
  const late = dose.status === 'pending' && dose.time < nowTime();
  const detail = [formatTime(dose.time), med.instructions].filter(Boolean).join(' · ');

  function more() {
    Alert.alert(`${med.name}${med.dose ? ` ${med.dose}` : ''}`, `${med.memberName} · ${formatTime(dose.time)}`, [
      // Android shows at most three buttons; a taken dose is undone with its circle instead.
      dose.status === 'skipped'
        ? { text: 'Undo skip', onPress: () => onSet(null) }
        : { text: 'Mark as skipped', onPress: () => onSet('skipped') },
      { text: 'Edit medicine', onPress: () => router.push({ pathname: '/medicines/edit', params: { id: med.id } }) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Pressable
      onLongPress={more}
      onPress={more}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: '#F1F5F9',
        },
        pressed && styles.pressed,
      ]}>
      <Avatar name={med.memberName} color={med.memberColor} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.title, { fontSize: 15 }, (taken || skipped) && { color: colors.muted, textDecorationLine: 'line-through' }]}
          numberOfLines={1}>
          {med.name}
          {med.dose ? ` ${med.dose}` : ''}
        </Text>
        <Text style={[styles.subtitle, { marginTop: 0 }, late && { color: '#C2410C', fontWeight: '600' }]} numberOfLines={1}>
          {skipped ? `Skipped · ${detail}` : late ? `Due ${detail}` : detail}
        </Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: taken }}
        accessibilityLabel={`${med.name} for ${med.memberName} at ${formatTime(dose.time)}, ${taken ? 'taken' : 'not taken'}`}
        hitSlop={6}
        onPress={() => onSet(taken ? null : 'taken')}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: taken ? '#DCFCE7' : colors.card,
          borderWidth: taken ? 0 : 2,
          borderColor: late ? '#FDBA74' : '#CBD5E1',
        }}>
        {taken ? <Icon name="checkmark" size={22} color="#047857" /> : null}
      </Pressable>
    </Pressable>
  );
}

export default function MedicinesScreen() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const [filter, setFilter] = useState<string | null>(params.memberId ?? null);
  const today = todayIso();

  const load = useCallback(async () => {
    const [meds, logs, permission] = await Promise.all([listMedications(db), listDoseLogs(db, today), hasNotificationPermission()]);
    return { meds, logs, permission };
  }, [db, today]);
  const { data, refresh } = useQuery(load);

  if (!data) return null;

  const memberIds = [...new Set(data.meds.map((m) => m.memberId))];
  const meds = data.meds.filter((m) => !filter || m.memberId === filter);
  const doses = dosesOn(meds, data.logs, today);
  const takenCount = doses.filter((d) => d.status === 'taken').length;
  const refills = meds.filter((m) => needsRefill(m, today));
  const remindersWanted = meds.some((m) => m.remindersOn && isCurrent(m, today));

  async function setStatus(dose: Dose, status: DoseStatus | null) {
    try {
      await setDoseStatus(db, dose.med, today, dose.time, status);
      refresh();
      syncRemindersQuietly(db);
    } catch (e) {
      showError('Could not update', e);
    }
  }

  const slots = (['morning', 'afternoon', 'evening', 'night'] as DoseSlot[])
    .map((slot) => ({ slot, list: doses.filter((d) => slotOf(d.time) === slot) }))
    .filter((s) => s.list.length);

  const add = () => router.push({ pathname: '/medicines/edit', params: filter ? { memberId: filter } : {} });

  return (
    <>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="Add medicine" hitSlop={8} style={{ marginRight: 16 }} onPress={add}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {data.meds.length === 0 ? (
          <EmptyState
            icon="medkit-outline"
            title="No medicines yet"
            message="Add the medicines your family takes. You’ll get a reminder at each dose time and a warning before they run out.">
            <Button title="Add medicine" icon="add-outline" onPress={add} />
          </EmptyState>
        ) : (
          <>
            <View role="tablist" style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: 12, padding: 4 }}>
              {(['today', 'all'] as const).map((t) => (
                <Pressable
                  key={t}
                  role="tab"
                  accessibilityState={{ selected: tab === t }}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? colors.card : 'transparent' }}>
                  <Text style={{ fontWeight: '600', color: tab === t ? colors.text : colors.muted }}>{t === 'today' ? 'Today' : 'All medicines'}</Text>
                </Pressable>
              ))}
            </View>

            {memberIds.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[null, ...memberIds].map((id) => {
                  const selected = filter === id;
                  const name = id ? data.meds.find((m) => m.memberId === id)!.memberName : 'Everyone';
                  return (
                    <Pressable key={id ?? 'all'} onPress={() => setFilter(id)} style={[styles.chip, selected && styles.chipSelected]}>
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {remindersWanted && !data.permission ? (
              <Card style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}>
                <Text style={[styles.title, { color: '#9A3412' }]}>Reminders are turned off</Text>
                <Text style={[styles.subtitle, { color: '#9A3412' }]}>Allow notifications so this phone can remind you at each dose time.</Text>
                <Button
                  title="Allow notifications"
                  icon="notifications-outline"
                  style={{ marginTop: 10 }}
                  onPress={async () => {
                    const ok = await requestNotificationPermission();
                    if (!ok) Alert.alert('Turn on in Settings', 'Open your phone’s Settings, find Family Health Registry, and allow notifications.');
                    syncRemindersQuietly(db);
                    refresh();
                  }}
                />
              </Card>
            ) : null}

            {refills.map((m) => (
              <Card key={`refill-${m.id}`} style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: '#9A3412', fontSize: 15 }]}>Refill soon: {m.name}</Text>
                    <Text style={[styles.subtitle, { color: '#9A3412' }]}>
                      {m.memberName} · {m.stock} left, about {daysOfSupply(m)} day{daysOfSupply(m) === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Button title="Update" variant="secondary" onPress={() => router.push({ pathname: '/medicines/edit', params: { id: m.id } })} />
                </View>
              </Card>
            ))}

            {tab === 'today' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <Text style={styles.title}>
                    {DAY_NAMES[new Date().getDay()]}, {formatDate(today)}
                  </Text>
                  {doses.length ? (
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>
                      {takenCount} of {doses.length} taken
                    </Text>
                  ) : null}
                </View>
                {doses.length ? (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${(takenCount / doses.length) * 100}%`, height: 8, backgroundColor: colors.primary }} />
                  </View>
                ) : (
                  <Text style={styles.subtitle}>No doses due today{filter ? ' for this person' : ''}.</Text>
                )}
                {slots.map(({ slot, list }) => (
                  <View key={slot} style={{ gap: 8 }}>
                    <SectionTitle>{SLOT_LABELS[slot]}</SectionTitle>
                    <Card style={{ padding: 0, overflow: 'hidden' }}>
                      {list.map((d, i) => (
                        <DoseRow key={`${d.med.id}-${d.time}`} dose={d} last={i === list.length - 1} onSet={(s) => setStatus(d, s)} />
                      ))}
                    </Card>
                  </View>
                ))}
                {doses.length ? (
                  <Text style={[styles.subtitle, { textAlign: 'center' }]}>Tap the circle when a dose is taken. Tap the row to skip it.</Text>
                ) : null}
              </>
            ) : (
              <AllMedicines meds={meds} today={today} />
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function AllMedicines({ meds, today }: { meds: MedicationWithMember[]; today: string }) {
  const current = meds.filter((m) => isCurrent(m, today));
  const past = meds.filter((m) => !isCurrent(m, today));
  const row = (m: MedicationWithMember, i: number, list: MedicationWithMember[]) => {
    const days = daysOfSupply(m);
    const extra = [
      m.stock !== null ? `${m.stock} left${days !== null ? ` · ~${days} days` : ''}` : null,
      m.endDate ? `${isCurrent(m, today) ? 'until' : 'ended'} ${formatDate(m.endDate)}` : null,
      m.startDate > today ? `starts ${formatDate(m.startDate)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable
        key={m.id}
        onPress={() => router.push({ pathname: '/medicines/edit', params: { id: m.id } })}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: '#F1F5F9' },
          pressed && styles.pressed,
        ]}>
        <Avatar name={m.memberName} color={m.memberColor} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { fontSize: 15 }]} numberOfLines={1}>
            {m.name}
            {m.dose ? ` ${m.dose}` : ''}
          </Text>
          <Text style={[styles.subtitle, { marginTop: 0 }]}>{scheduleText(m)}</Text>
          {extra ? <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>{extra}</Text> : null}
        </View>
        {m.remindersOn && isCurrent(m, today) ? (
          <Icon name="notifications-outline" size={18} color={colors.muted} />
        ) : null}
        <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
      </Pressable>
    );
  };
  return (
    <>
      {current.length ? (
        <>
          <SectionTitle>Taking now ({current.length})</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>{current.map(row)}</Card>
        </>
      ) : null}
      {past.length ? (
        <>
          <SectionTitle>Stopped ({past.length})</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>{past.map(row)}</Card>
        </>
      ) : null}
    </>
  );
}
