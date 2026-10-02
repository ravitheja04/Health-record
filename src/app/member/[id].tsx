import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow } from '@/components/RecordRow';
import { Avatar, Button, Card, ChipSelect, colors, EmptyState, Icon, InfoRow, SectionTitle, styles } from '@/components/ui';
import { deleteMember, getMember, listRecords } from '@/lib/db';
import { removeAttachmentFiles } from '@/lib/files';
import { ageFrom, formatDate, todayIso } from '@/lib/format';
import { countMemberResults } from '@/lib/labs';
import { isCurrent } from '@/lib/medSchedule';
import { listMedications } from '@/lib/meds';
import { syncRemindersQuietly } from '@/lib/reminders';
import { sortVaccinations, vaccineDetail, vaccineStatus, vaccineSummary } from '@/lib/vaccineAnalysis';
import { listVaccinations } from '@/lib/vaccines';
import { formatVital, latestByType, VITALS } from '@/lib/vitalsAnalysis';
import { listVitals } from '@/lib/vitals';
import { shareMemberSummaryPdf, shareRegistryBundle } from '@/lib/share';
import { showError, useQuery } from '@/lib/useQuery';
import { RECORD_TYPES, type RecordType } from '@/lib/types';

const TYPE_KEYS = Object.keys(RECORD_TYPES) as RecordType[];

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<RecordType | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'file' | null>(null);
  const load = useCallback(
    async () => ({
      member: await getMember(db, id),
      records: await listRecords(db, id),
      labTests: await countMemberResults(db, id),
      meds: await listMedications(db, id),
      vaccines: await listVaccinations(db, id),
      vitals: latestByType(await listVitals(db, id)),
    }),
    [db, id]
  );
  const { data } = useQuery(load);

  const member = data?.member;
  if (!data) return null;
  if (!member) {
    return <EmptyState icon="alert-circle-outline" title="Member not found" message="This family member may have been deleted." />;
  }

  const records = data.records.filter((r) => !filter || r.type === filter);
  const presentTypes = TYPE_KEYS.filter((t) => data.records.some((r) => r.type === t));
  const age = ageFrom(member.dob);

  async function run(kind: 'pdf' | 'file') {
    setBusy(kind);
    try {
      if (kind === 'pdf') await shareMemberSummaryPdf(db, id);
      else await shareRegistryBundle(db, [id]);
    } catch (e) {
      showError('Could not share', e);
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${member!.name}?`,
      `This permanently removes ${member!.name} and all ${data!.records.length} of their records and files from this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              removeAttachmentFiles(await deleteMember(db, id));
              syncRemindersQuietly(db);
              router.back();
            } catch (e) {
              showError('Could not delete', e);
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: member.name,
          headerRight: () => (
            <Pressable
              accessibilityLabel="Edit member"
              hitSlop={8}
              onPress={() => router.push({ pathname: '/member/edit', params: { id } })}>
              <Icon name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card>
          <View style={styles.row}>
            <Avatar name={member.name} color={member.color} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { fontSize: 20 }]}>{member.name}</Text>
              <Text style={styles.subtitle}>
                {[member.relation, age !== null ? `${age} years` : null, member.gender].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {member.bloodGroup ? (
              <View style={{ alignItems: 'center' }}>
                <Icon name="water-outline" color={colors.danger} />
                <Text style={[styles.title, { color: colors.danger }]}>{member.bloodGroup}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {member.allergies.trim() ? (
          <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#FECACA' }}>
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <Icon name="warning-outline" color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.danger }]}>Allergies</Text>
                <Text style={styles.body} selectable>
                  {member.allergies}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card>
          <InfoRow icon="calendar-outline" label="Born" value={formatDate(member.dob)} />
          <InfoRow icon="fitness-outline" label="Conditions" value={member.conditions} />
          <InfoRow icon="medkit-outline" label="Medications" value={member.medications} />
          <InfoRow icon="call-outline" label="Emergency" value={member.emergencyContact} />
          <InfoRow icon="document-text-outline" label="Notes" value={member.notes} />
          {!member.conditions && !member.medications && !member.emergencyContact && !member.notes && !member.dob ? (
            <Text style={styles.subtitle}>Tap the edit icon to add conditions, medications and an emergency contact.</Text>
          ) : null}
        </Card>

        <Button
          title="Emergency card"
          icon="medical"
          variant="danger"
          onPress={() => router.push({ pathname: '/emergency/[memberId]', params: { memberId: id } })}
        />
        <Button
          title="Add medical record"
          icon="add-outline"
          onPress={() => router.push({ pathname: '/record/edit', params: { memberId: id } })}
        />
        <Card onPress={() => router.push({ pathname: '/medicines', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="medkit-outline" color="#DB2777" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Medicines & reminders</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {(() => {
                  const current = data.meds.filter((m) => isCurrent(m, todayIso()));
                  return current.length
                    ? current.map((m) => m.name).join(', ')
                    : 'Add medicines to get dose reminders';
                })()}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        <Card onPress={() => router.push({ pathname: '/vaccines/[memberId]', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="shield-checkmark-outline" color="#059669" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Vaccinations</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {(() => {
                  const today = todayIso();
                  if (!data.vaccines.length) return 'Track doses given and when the next ones are due';
                  const s = vaccineSummary(data.vaccines, today);
                  const next = sortVaccinations(data.vaccines, today).find((v) => vaccineStatus(v, today) !== 'given');
                  return `${s.given} of ${s.total} given${next ? ` · ${next.name}: ${vaccineDetail(next, today)}` : ''}`;
                })()}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        {age !== null && age < 18 ? (
          <Card onPress={() => router.push({ pathname: '/growth/[memberId]', params: { memberId: id } })}>
            <View style={styles.row}>
              <Icon name="trending-up-outline" color="#16A34A" size={24} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Growth</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {age < 5 ? 'Weight, height and head size on WHO growth charts' : 'Weight, height and BMI over time'}
                </Text>
              </View>
              <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
            </View>
          </Card>
        ) : null}
        <Card onPress={() => router.navigate({ pathname: '/vitals', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="pulse-outline" color="#DC2626" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Vitals</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {data.vitals.size
                  ? VITALS.flatMap((d) => {
                      const v = data.vitals.get(d.type);
                      return v ? [`${d.short} ${formatVital(v)}`] : [];
                    })
                      .slice(0, 3)
                      .join(' · ')
                  : 'Log blood pressure, sugar, weight and more'}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        <Card onPress={() => router.push({ pathname: '/labs/[memberId]', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="analytics-outline" color="#7C3AED" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Lab trends</Text>
              <Text style={styles.subtitle}>
                {data.labTests > 0
                  ? `${data.labTests} test${data.labTests === 1 ? '' : 's'} tracked across reports`
                  : 'Track test results across reports'}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} variant="secondary" title="Share PDF" icon="document-outline" loading={busy === 'pdf'} onPress={() => run('pdf')} />
          <Button style={{ flex: 1 }} variant="secondary" title="Send to family" icon="share-social-outline" loading={busy === 'file'} onPress={() => run('file')} />
        </View>

        <SectionTitle>Medical records ({data.records.length})</SectionTitle>
        {presentTypes.length > 1 ? (
          <ChipSelect options={presentTypes} value={filter} onChange={setFilter} renderLabel={(t) => RECORD_TYPES[t].label} />
        ) : null}
        {records.length === 0 ? (
          <EmptyState icon="folder-outline" title="No records yet" message="Add lab reports, prescriptions, scans and vaccinations with photos or PDFs attached." />
        ) : (
          records.map((r) => <RecordRow key={r.id} record={r} />)
        )}

        <Button title={`Delete ${member.name}`} icon="trash-outline" variant="danger" onPress={confirmDelete} style={{ marginTop: 24 }} />
      </ScrollView>
    </>
  );
}
