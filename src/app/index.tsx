import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow } from '@/components/RecordRow';
import { Avatar, Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { listMembers, listRecentRecords } from '@/lib/db';
import { ageFrom } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(
    async () => ({ members: await listMembers(db), recent: await listRecentRecords(db, 5) }),
    [db]
  );
  const { data } = useQuery(load);
  const members = data?.members ?? [];
  const recent = data?.recent ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
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
