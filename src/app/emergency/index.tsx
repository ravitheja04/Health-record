import { Redirect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, colors, EmptyState, Icon, styles } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { useQuery } from '@/lib/useQuery';

/** Opens the emergency card directly when there is one member, otherwise asks whose. */
export default function EmergencyPickerScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const load = useCallback(() => listMembers(db), [db]);
  const { data: members } = useQuery(load);

  if (!members) return null;
  if (members.length === 1) return <Redirect href={{ pathname: '/emergency/[memberId]', params: { memberId: members[0].id } }} />;
  if (!members.length) {
    return (
      <EmptyState icon="medical-outline" title="No family members yet" message="Add a family member to create their emergency card.">
        <Button title="Add family member" icon="person-add-outline" onPress={() => router.replace('/member/edit')} />
      </EmptyState>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.subtitle}>Whose emergency card?</Text>
      {members.map((m) => (
        <Card key={m.id} onPress={() => router.push({ pathname: '/emergency/[memberId]', params: { memberId: m.id } })}>
          <View style={styles.row}>
            <Avatar name={m.name} color={m.color} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{m.name}</Text>
              <Text style={[styles.subtitle, m.allergies.trim() ? { color: '#B91C1C' } : null]} numberOfLines={1}>
                {m.allergies.trim() ? `Allergies: ${m.allergies}` : 'No known allergies'}
              </Text>
            </View>
            {m.bloodGroup ? <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 17 }}>{m.bloodGroup}</Text> : null}
            <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
