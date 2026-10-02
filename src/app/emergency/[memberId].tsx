import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmergencyCardView, emergencyHeader } from '@/components/EmergencyCard';

export default function EmergencyCardScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  return (
    <>
      <Stack.Screen options={emergencyHeader(memberId)} />
      <EmergencyCardView memberId={memberId} onSelectMember={(id) => router.setParams({ memberId: id })} />
    </>
  );
}
