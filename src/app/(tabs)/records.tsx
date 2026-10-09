import { router, Tabs } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { RecordRow } from '@/components/RecordRow';
import { ReportPicker, Segmented, SmartReportView } from '@/components/SmartReport';
import { Avatar, Button, colors, EmptyState, Icon, styles } from '@/components/ui';
import { listAllRecords, listMembers } from '@/lib/db';
import { listAllResults } from '@/lib/labs';
import { shareSmartReportPdf } from '@/lib/share';
import { buildSmartReport } from '@/lib/smartReport';
import { showError, useQuery } from '@/lib/useQuery';
import { RECORD_TYPES, type Member, type RecordType } from '@/lib/types';
import { t, tn } from '@/i18n';

function FilterChips<T extends string>({ items, value, onChange }: {
  items: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {[{ key: null as T | null, label: t('All') }, ...items].map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Family members as avatar buttons; members without lab results are dimmed. */
function MemberPicker({ members, counts, value, onChange }: { members: Member[]; counts: Map<string, number>; value: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 2 }}>
      {members.map((m) => {
        const selected = m.id === value;
        const n = counts.get(m.id) ?? 0;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${m.name}, ${tn(n, '{n} test', '{n} tests')}`}
            onPress={() => onChange(m.id)}
            style={{ alignItems: 'center', gap: 4, width: 64, opacity: n ? 1 : 0.45 }}>
            <View style={{ borderRadius: 30, padding: 2, borderWidth: 2, borderColor: selected ? colors.primary : 'transparent' }}>
              <Avatar name={m.name} color={m.color} size={44} />
            </View>
            <Text style={{ fontSize: 12, fontWeight: selected ? '700' : '500', color: selected ? colors.primary : colors.text }} numberOfLines={1}>
              {m.name.split(' ')[0]}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{tn(n, '{n} test', '{n} tests')}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function RecordsTab() {
  const db = useSQLiteContext();
  const load = useCallback(
    async () => ({ records: await listAllRecords(db), members: await listMembers(db), results: await listAllResults(db) }),
    [db]
  );
  const { data } = useQuery(load);
  const [query, setQuery] = useState('');
  const [member, setMember] = useState<string | null>(null);
  const [type, setType] = useState<RecordType | null>(null);
  const [mode, setMode] = useState<'records' | 'smart'>('records');
  const [smartMember, setSmartMember] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // The smart report follows the member filter, else the first member with lab results.
  const tests = new Map<string, Set<string>>();
  for (const r of data?.results ?? []) tests.set(r.memberId, (tests.get(r.memberId) ?? new Set()).add(r.testKey));
  const counts = new Map([...tests].map(([id, keys]) => [id, keys.size]));
  const reportMember = smartMember ?? member ?? data?.members.find((m) => counts.has(m.id))?.id ?? data?.members[0]?.id ?? null;
  const report = data && reportMember ? buildSmartReport(data.results.filter((r) => r.memberId === reportMember), asOf) : null;
  const asOfValue = asOf && report?.allColumns[report.allColumns.length - 1]?.recordId === asOf ? null : asOf;

  async function share() {
    if (!reportMember) return;
    setSharing(true);
    try {
      await shareSmartReportPdf(db, reportMember, asOfValue);
    } catch (e) {
      showError(t('Could not share'), e);
    } finally {
      setSharing(false);
    }
  }

  const add = () => router.push({ pathname: '/record/edit', params: member ? { memberId: member } : {} });
  const header = (
    <Tabs.Screen
      options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 18, marginRight: 16 }}>
            {mode === 'smart' && report?.testCount ? (
              <Pressable accessibilityLabel={t('Share as PDF')} hitSlop={8} onPress={share} disabled={sharing}>
                <Icon name="share-outline" size={24} color={colors.primary} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={t('Read a lab report PDF')}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/record/import', params: member ? { memberId: member } : {} })}>
              <Icon name="scan-outline" size={24} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityLabel={t('Add record')} hitSlop={8} onPress={add}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          </View>
        ),
      }}
    />
  );
  if (!data) return header;

  const modeSwitch = data.results.length ? (
    <Segmented
      items={[
        ['records', t('All records')],
        ['smart', t('Smart report')],
      ]}
      value={mode}
      onChange={setMode}
    />
  ) : null;

  if (mode === 'smart' && modeSwitch && reportMember) {
    return (
      <>
        {header}
        <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 32 }]}>
          {modeSwitch}
          {data.members.length > 1 ? (
            <MemberPicker
              members={data.members}
              counts={counts}
              value={reportMember}
              onChange={(id) => {
                setSmartMember(id);
                setAsOf(null);
              }}
            />
          ) : null}
          {report?.testCount ? (
            <>
              <ReportPicker report={report} value={asOfValue} onChange={setAsOf} />
              <SmartReportView key={`${reportMember}-${asOfValue ?? 'latest'}`} report={report} memberId={reportMember} />
              <Button title={t('Share as PDF')} icon="document-outline" variant="secondary" loading={sharing} onPress={share} />
            </>
          ) : (
            <EmptyState
              icon="document-text-outline"
              title={t('No test results yet')}
              message={t('Add lab reports to build a smart report of every test from the first report to the latest.')}>
              <Button
                title={t('Read a lab report PDF')}
                icon="scan-outline"
                onPress={() => router.push({ pathname: '/record/import', params: { memberId: reportMember } })}
              />
            </EmptyState>
          )}
        </ScrollView>
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const presentTypes = (Object.keys(RECORD_TYPES) as RecordType[]).filter((t) => data.records.some((r) => r.type === t));
  const list = data.records.filter(
    (r) =>
      (!member || r.memberId === member) &&
      (!type || r.type === type) &&
      (!q || [r.title, r.doctor, r.facility, r.notes, r.memberName ?? ''].some((f) => f.toLowerCase().includes(q)))
  );

  return (
    <>
      {header}
      <FlatList
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        data={list}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <RecordRow record={item} showMember={!member} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {modeSwitch}
            <View style={[styles.input, styles.row, { paddingVertical: 4 }]}>
              <Icon name="search-outline" color={colors.muted} size={18} />
              <TextInput
                style={{ flex: 1, fontSize: 15, paddingVertical: 8, color: colors.text }}
                placeholder={t('Search title, doctor, hospital, notes')}
                placeholderTextColor={colors.placeholder}
                value={query}
                onChangeText={setQuery}
                clearButtonMode="while-editing"
                returnKeyType="search"
                accessibilityLabel={t('Search records')}
              />
            </View>
            {data.members.length > 1 ? (
              <FilterChips items={data.members.map((m) => ({ key: m.id, label: m.name.split(' ')[0] }))} value={member} onChange={setMember} />
            ) : null}
            {presentTypes.length > 1 ? (
              <FilterChips items={presentTypes.map((t) => ({ key: t, label: RECORD_TYPES[t].label }))} value={type} onChange={setType} />
            ) : null}
            <Text style={styles.subtitle}>
              {tn(list.length, '{n} record', '{n} records')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          data.records.length === 0 ? (
            <EmptyState icon="folder-open-outline" title={t('No records yet')} message={t('Add lab reports, prescriptions, scans and other medical papers.')}>
              {data.members.length ? <Button title={t('Add record')} icon="add-outline" onPress={add} /> : null}
            </EmptyState>
          ) : (
            <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 24 }]}>{t('No records match.')}</Text>
          )
        }
      />
    </>
  );
}
