import { router, Tabs } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { EmergencyCardView, emergencyHeader } from '@/components/EmergencyCard';
import { Button, EmptyState } from '@/components/ui';
import { listMembers } from '@/lib/db';
import { useQuery } from '@/lib/useQuery';

export default function EmergencyTab() {
  const db = useSQLiteContext();
  const load = useCallback(() => listMembers(db), [db]);
  const { data: members } = useQuery(load);
  const [selected, setSelected] = useState<string | null>(null);

  if (!members) return null;
  const memberId = members.find((m) => m.id === selected)?.id ?? members[0]?.id ?? null;

  return (
    <>
      <Tabs.Screen options={emergencyHeader(memberId)} />
      {memberId ? (
        <EmergencyCardView memberId={memberId} onSelectMember={setSelected} />
      ) : (
        <EmptyState icon="medical-outline" title="No family members yet" message="Add a family member to create their emergency card.">
          <Button title="Add family member" icon="person-add-outline" onPress={() => router.push('/member/edit')} />
        </EmptyState>
      )}
    </>
  );
}
