import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { ageFrom, todayIso } from '@/lib/format';
import { syncRemindersQuietly } from '@/lib/reminders';
import { showError, useQuery } from '@/lib/useQuery';
import {
  sortVaccinations,
  STATUS_STYLE,
  vaccineDetail,
  vaccineStatus,
  vaccineSummary,
  type VaccineStatus,
} from '@/lib/vaccineAnalysis';
import { listVaccinations, markPastDosesGiven, setGivenDate, type VaccinationWithMember } from '@/lib/vaccines';

function ProgressRing({ given, total }: { given: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total ? given / total : 0;
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={32} cy={32} r={r} fill="none" stroke={colors.border} strokeWidth={8} />
      <Circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke={colors.okText}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 32 32)"
      />
    </Svg>
  );
}

export default function VaccinesScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const today = todayIso();
  const load = useCallback(async () => {
    const [member, list] = await Promise.all([getMember(db, memberId), listVaccinations(db, memberId)]);
    return { member, list };
  }, [db, memberId]);
  const { data, refresh } = useQuery(load);

  if (!data) return null;
  const { member, list } = data;
  if (!member) return <EmptyState icon="alert-circle-outline" title="Member not found" message="This family member may have been deleted." />;

  const sorted = sortVaccinations(list, today);
  const summary = vaccineSummary(list, today);
  const age = ageFrom(member.dob);
  const isChild = age === null || age < 19;
  const fromSchedule = list.some((v) => v.scheduleKey);
  const pastFromSchedule = list.filter((v) => v.scheduleKey && vaccineStatus(v, today) === 'overdue').length;
  const firstName = member.name.split(' ')[0];

  async function setGiven(id: string, date: string | null) {
    try {
      await setGivenDate(db, id, date);
      refresh();
      syncRemindersQuietly(db);
    } catch (e) {
      showError('Could not update', e);
    }
  }

  function actions(v: VaccinationWithMember) {
    const title = [v.name, v.dose].filter(Boolean).join(' · ');
    const edit = { text: 'Edit or other date…', onPress: () => router.push({ pathname: '/vaccines/edit', params: { id: v.id } }) };
    if (v.givenDate) {
      Alert.alert(title, vaccineDetail(v, today), [edit, { text: 'Mark as not given', onPress: () => setGiven(v.id, null) }, { text: 'Cancel', style: 'cancel' }]);
    } else {
      Alert.alert(title, vaccineDetail(v, today), [{ text: 'Given today', onPress: () => setGiven(v.id, today) }, edit, { text: 'Cancel', style: 'cancel' }]);
    }
  }

  function markPast() {
    Alert.alert(
      'Mark past doses as given?',
      `${pastFromSchedule} overdue dose${pastFromSchedule === 1 ? '' : 's'} from the schedule will be marked as given on their due dates. Use this if ${firstName} was vaccinated before you started using the app. You can correct any date afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as given',
          onPress: async () => {
            try {
              await markPastDosesGiven(db, memberId, today);
              refresh();
              syncRemindersQuietly(db);
            } catch (e) {
              showError('Could not update', e);
            }
          },
        },
      ]
    );
  }

  const sections: { status: VaccineStatus; title: string }[] = [
    { status: 'overdue', title: 'Overdue' },
    { status: 'due', title: 'Due in the next 30 days' },
    { status: 'upcoming', title: 'Upcoming' },
    { status: 'undated', title: 'No date set' },
    { status: 'given', title: 'Given' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: `${firstName}’s vaccinations`,
          headerRight: () => (
            <Pressable accessibilityLabel="Add vaccination" hitSlop={8} onPress={() => router.push({ pathname: '/vaccines/edit', params: { memberId } })}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {list.length ? (
          <Card>
            <View style={styles.row}>
              <ProgressRing given={summary.given} total={summary.total} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { fontSize: 18 }]}>
                  {summary.given} of {summary.total} given
                </Text>
                <Text style={styles.subtitle}>
                  {[
                    summary.overdue ? `${summary.overdue} overdue` : null,
                    summary.due ? `${summary.due} due soon` : null,
                    summary.upcoming ? `${summary.upcoming} upcoming` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Nothing due'}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {isChild && !fromSchedule ? (
          <Card style={{ gap: 8 }}>
            <Text style={styles.title}>Add {firstName}’s vaccination schedule</Text>
            <Text style={styles.subtitle}>
              Fill in every childhood vaccine with due dates worked out from the date of birth, using the government (NIS) or IAP
              schedule.
            </Text>
            <Button title="Choose a schedule" icon="calendar-outline" onPress={() => router.push({ pathname: '/vaccines/schedule', params: { memberId } })} />
          </Card>
        ) : null}

        {!list.length && !isChild ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="No vaccinations yet"
            message="Add vaccines like the yearly flu shot, COVID-19, Tdap or hepatitis B, with the date given or when the next dose is due.">
            <Button title="Add vaccination" icon="add-outline" onPress={() => router.push({ pathname: '/vaccines/edit', params: { memberId } })} />
          </EmptyState>
        ) : null}

        {pastFromSchedule > 1 ? (
          <Button title={`Already given? Mark ${pastFromSchedule} past doses as given`} icon="checkmark-done-outline" variant="secondary" onPress={markPast} />
        ) : null}

        {sections.map(({ status, title }) => {
          const items = sorted.filter((v) => vaccineStatus(v, today) === status);
          if (!items.length) return null;
          const style = STATUS_STYLE[status];
          return (
            <View key={status} style={{ gap: 8 }}>
              <SectionTitle>
                <Text style={status === 'overdue' ? { color: style.color } : undefined}>
                  {title} ({items.length})
                </Text>
              </SectionTitle>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {items.map((v, i) => (
                  <Pressable
                    key={v.id}
                    accessibilityRole="button"
                    onPress={() => actions(v)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderBottomWidth: i === items.length - 1 ? 0 : 1,
                        borderBottomColor: colors.subtle,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: style.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon
                        name={status === 'given' ? 'checkmark' : status === 'overdue' ? 'alert-outline' : 'time-outline'}
                        size={16}
                        color={style.color}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.title, { fontSize: 15 }]} numberOfLines={1}>
                        {v.name}
                        {v.dose ? <Text style={{ fontWeight: '400', color: colors.muted }}> · {v.dose}</Text> : null}
                      </Text>
                      <Text style={[styles.subtitle, { marginTop: 0 }, status === 'overdue' && { color: style.color }]} numberOfLines={1}>
                        {vaccineDetail(v, today)}
                      </Text>
                    </View>
                    {v.recordId ? <Icon name="document-attach-outline" size={18} color={colors.muted} /> : null}
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        {fromSchedule ? (
          <Text style={[styles.subtitle, { lineHeight: 18 }]}>
            Schedule dates are typical ages worked out from the date of birth. Your paediatrician may advise different timing; tap any
            dose to change it.
          </Text>
        ) : null}
        {isChild && fromSchedule ? (
          <Pressable onPress={() => router.push({ pathname: '/vaccines/schedule', params: { memberId } })}>
            <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>Add doses from another schedule</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}
