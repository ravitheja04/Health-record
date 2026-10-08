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
import { t, tn } from '@/i18n';

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
    return <EmptyState icon="alert-circle-outline" title={t('Member not found')} message={t('This family member may have been deleted.')} />;
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
      showError(t('Could not share'), e);
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      t('Delete {name}?', { name: member!.name }),
      t('This permanently removes {name} and all {count} of their records and files from this phone.', { name: member!.name, count: data!.records.length }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              removeAttachmentFiles(await deleteMember(db, id));
              syncRemindersQuietly(db);
              router.back();
            } catch (e) {
              showError(t('Could not delete'), e);
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
              accessibilityLabel={t('Edit member')}
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
                {[member.relation && t(member.relation), age !== null ? t('{n} years', { n: age }) : null, member.gender && t(member.gender)].filter(Boolean).join(' · ')}
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
          <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder }}>
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <Icon name="warning-outline" color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.danger }]}>{t('Allergies')}</Text>
                <Text style={styles.body} selectable>
                  {member.allergies}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card>
          <InfoRow icon="calendar-outline" label={t('Born')} value={formatDate(member.dob)} />
          <InfoRow icon="fitness-outline" label={t('Conditions')} value={member.conditions} />
          <InfoRow icon="medkit-outline" label={t('Medications')} value={member.medications} />
          <InfoRow icon="call-outline" label={t('Emergency')} value={member.emergencyContact} />
          <InfoRow icon="document-text-outline" label={t('Notes')} value={member.notes} />
          {!member.conditions && !member.medications && !member.emergencyContact && !member.notes && !member.dob ? (
            <Text style={styles.subtitle}>{t('Tap the edit icon to add conditions, medications and an emergency contact.')}</Text>
          ) : null}
        </Card>

        <Button
          title={t('Emergency card')}
          icon="medical"
          variant="danger"
          onPress={() => router.push({ pathname: '/emergency/[memberId]', params: { memberId: id } })}
        />
        <Button
          title={t('Add medical record')}
          icon="add-outline"
          onPress={() => router.push({ pathname: '/record/edit', params: { memberId: id } })}
        />
        <Card onPress={() => router.push({ pathname: '/medicines', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="medkit-outline" color="#DB2777" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('Medicines & reminders')}</Text>
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
              <Text style={styles.title}>{t('Vaccinations')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {(() => {
                  const today = todayIso();
                  if (!data.vaccines.length) return 'Track doses given and when the next ones are due';
                  const s = vaccineSummary(data.vaccines, today);
                  const next = sortVaccinations(data.vaccines, today).find((v) => vaccineStatus(v, today) !== 'given');
                  return `${t('{given} of {total} given', { given: s.given, total: s.total })}${next ? ` · ${next.name}: ${vaccineDetail(next, today)}` : ''}`;
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
                <Text style={styles.title}>{t('Growth')}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {age < 5 ? t('Weight, height and head size on WHO growth charts') : t('Weight, height and BMI over time')}
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
              <Text style={styles.title}>{t('Vitals')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {data.vitals.size
                  ? VITALS.flatMap((d) => {
                      const v = data.vitals.get(d.type);
                      return v ? [`${d.short} ${formatVital(v)}`] : [];
                    })
                      .slice(0, 3)
                      .join(' · ')
                  : t('Log blood pressure, sugar, weight and more')}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        <Card onPress={() => router.push({ pathname: '/labs/[memberId]', params: { memberId: id } })}>
          <View style={styles.row}>
            <Icon name="analytics-outline" color="#7C3AED" size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('Lab trends')}</Text>
              <Text style={styles.subtitle}>
                {data.labTests > 0
                  ? tn(data.labTests, '{n} test tracked across reports', '{n} tests tracked across reports')
                  : t('Track test results across reports')}
              </Text>
            </View>
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
        {data.labTests > 0 ? (
          <Card onPress={() => router.push({ pathname: '/labs/report', params: { memberId: id } })}>
            <View style={styles.row}>
              <Icon name="document-text-outline" color="#0D9488" size={24} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('Smart report')}</Text>
                <Text style={styles.subtitle}>{t('All tests from the first report to the latest, by body system')}</Text>
              </View>
              <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
            </View>
          </Card>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} variant="secondary" title={t('Share PDF')} icon="document-outline" loading={busy === 'pdf'} onPress={() => run('pdf')} />
          <Button style={{ flex: 1 }} variant="secondary" title={t('Send to family')} icon="share-social-outline" loading={busy === 'file'} onPress={() => run('file')} />
        </View>

        <SectionTitle>{t('Medical records ({n})', { n: data.records.length })}</SectionTitle>
        {presentTypes.length > 1 ? (
          <ChipSelect options={presentTypes} value={filter} onChange={setFilter} renderLabel={(t) => RECORD_TYPES[t].label} />
        ) : null}
        {records.length === 0 ? (
          <EmptyState icon="folder-outline" title={t('No records yet')} message={t('Add lab reports, prescriptions, scans and vaccinations with photos or PDFs attached.')} />
        ) : (
          records.map((r) => <RecordRow key={r.id} record={r} />)
        )}

        <Button title={t('Delete {name}', { name: member.name })} icon="trash-outline" variant="danger" onPress={confirmDelete} style={{ marginTop: 24 }} />
      </ScrollView>
    </>
  );
}
