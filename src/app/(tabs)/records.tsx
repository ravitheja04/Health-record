import { router, Tabs } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { RecordRow } from '@/components/RecordRow';
import { Button, colors, EmptyState, Icon, styles } from '@/components/ui';
import { listAllRecords, listMembers } from '@/lib/db';
import { useQuery } from '@/lib/useQuery';
import { RECORD_TYPES, type RecordType } from '@/lib/types';

function FilterChips<T extends string>({ items, value, onChange }: {
  items: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {[{ key: null as T | null, label: 'All' }, ...items].map((item) => {
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

export default function RecordsTab() {
  const db = useSQLiteContext();
  const load = useCallback(async () => ({ records: await listAllRecords(db), members: await listMembers(db) }), [db]);
  const { data } = useQuery(load);
  const [query, setQuery] = useState('');
  const [member, setMember] = useState<string | null>(null);
  const [type, setType] = useState<RecordType | null>(null);

  const add = () => router.push({ pathname: '/record/edit', params: member ? { memberId: member } : {} });
  const header = (
    <Tabs.Screen
      options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 18, marginRight: 16 }}>
            <Pressable
              accessibilityLabel="Read a lab report PDF"
              hitSlop={8}
              onPress={() => router.push({ pathname: '/record/import', params: member ? { memberId: member } : {} })}>
              <Icon name="scan-outline" size={24} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityLabel="Add record" hitSlop={8} onPress={add}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          </View>
        ),
      }}
    />
  );
  if (!data) return header;

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
            <View style={[styles.input, styles.row, { paddingVertical: 4 }]}>
              <Icon name="search-outline" color={colors.muted} size={18} />
              <TextInput
                style={{ flex: 1, fontSize: 15, paddingVertical: 8, color: colors.text }}
                placeholder="Search title, doctor, hospital, notes"
                placeholderTextColor={colors.placeholder}
                value={query}
                onChangeText={setQuery}
                clearButtonMode="while-editing"
                returnKeyType="search"
                accessibilityLabel="Search records"
              />
            </View>
            {data.members.length > 1 ? (
              <FilterChips items={data.members.map((m) => ({ key: m.id, label: m.name.split(' ')[0] }))} value={member} onChange={setMember} />
            ) : null}
            {presentTypes.length > 1 ? (
              <FilterChips items={presentTypes.map((t) => ({ key: t, label: RECORD_TYPES[t].label }))} value={type} onChange={setType} />
            ) : null}
            <Text style={styles.subtitle}>
              {list.length} record{list.length === 1 ? '' : 's'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          data.records.length === 0 ? (
            <EmptyState icon="folder-open-outline" title="No records yet" message="Add lab reports, prescriptions, scans and other medical papers.">
              {data.members.length ? <Button title="Add record" icon="add-outline" onPress={add} /> : null}
            </EmptyState>
          ) : (
            <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 24 }]}>No records match.</Text>
          )
        }
      />
    </>
  );
}
