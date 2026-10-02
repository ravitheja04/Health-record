import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QrCode } from '@/components/QrCode';
import { Button, Card, colors, EmptyState, Icon, styles } from '@/components/ui';
import { getMember, listMembers } from '@/lib/db';
import { getEmergencyInfo } from '@/lib/emergency';
import { cardContacts, dialable, emergencyText } from '@/lib/emergencyText';
import { ageFrom, todayIso } from '@/lib/format';
import { isCurrent } from '@/lib/medSchedule';
import { listMedications } from '@/lib/meds';
import { shareEmergencyPdf } from '@/lib/share';
import { showError, useQuery } from '@/lib/useQuery';

export const EMERGENCY_RED = '#B91C1C';
const RED = EMERGENCY_RED;

function call(phone: string) {
  const number = dialable(phone);
  if (!number) return Alert.alert('No phone number', 'Add a phone number for this contact first.');
  Linking.openURL(`tel:${number}`).catch(() => Alert.alert('Can’t make calls', `Dial ${phone} from your phone app.`));
}

function CallButton({ phone, label }: { phone: string; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Call ${label}`}
      onPress={() => call(phone)}
      style={({ pressed }) => [
        { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
        pressed && styles.pressed,
      ]}>
      <Icon name="call" color="#047857" size={22} />
    </Pressable>
  );
}

function Block({ title, children, tone }: { title: string; children: ReactNode; tone?: 'alert' }) {
  return (
    <Card style={tone === 'alert' ? { borderColor: '#FECACA', borderWidth: 1 } : undefined}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: tone === 'alert' ? RED : colors.muted, marginBottom: 6 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </Card>
  );
}

/** The emergency card for one member, with buttons to switch to other family members. */
export function EmergencyCardView({ memberId, onSelectMember }: { memberId: string; onSelectMember: (id: string) => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const today = todayIso();
  const load = useCallback(async () => {
    const [member, info, meds, members] = await Promise.all([
      getMember(db, memberId),
      getEmergencyInfo(db, memberId),
      listMedications(db, memberId),
      listMembers(db),
    ]);
    return { member, info, meds: meds.filter((m) => isCurrent(m, todayIso())), members };
  }, [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, info, meds, members } = data;
  if (!member) return <EmptyState icon="alert-circle-outline" title="Member not found" message="This family member may have been deleted." />;

  const age = ageFrom(member.dob);
  const contacts = cardContacts(member, info);
  const medicineNames = meds.map((m) => [m.name, m.dose].filter(Boolean).join(' '));
  const text = emergencyText(member, info, medicineNames, today);
  const hasDoctor = !!(info?.doctorName || info?.doctorPhone);
  const hasInsurance = !!(info?.insurer || info?.policyNumber);

  async function sharePdf() {
    setSharing(true);
    try {
      await shareEmergencyPdf(db, memberId);
    } catch (e) {
      showError('Could not share', e);
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ backgroundColor: RED, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 12 }}>
          {members.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {members.map((m) => {
                const selected = m.id === memberId;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelectMember(m.id)}
                    style={{
                      paddingHorizontal: 14,
                      height: 36,
                      justifyContent: 'center',
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.6)',
                      backgroundColor: selected ? '#FFFFFF' : 'transparent',
                    }}>
                    <Text style={{ color: selected ? RED : '#FFFFFF', fontWeight: '600' }}>{m.name.split(' ')[0]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700' }} selectable>
                {member.name}
              </Text>
              <Text style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 15, marginTop: 2 }}>
                {[age !== null ? `${age} years` : null, member.gender].filter(Boolean).join(' · ') || ' '}
              </Text>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 72 }}>
              <Text style={{ color: RED, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>BLOOD</Text>
              <Text style={{ color: RED, fontSize: 24, fontWeight: '800' }}>{member.bloodGroup ?? '?'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <Block title="Allergies" tone="alert">
            {member.allergies.trim() ? (
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#991B1B' }} selectable>
                {member.allergies}
              </Text>
            ) : (
              <Text style={styles.body}>None known</Text>
            )}
          </Block>

          {member.conditions.trim() ? (
            <Block title="Medical conditions">
              <Text style={styles.body} selectable>
                {member.conditions}
              </Text>
            </Block>
          ) : null}

          {medicineNames.length || member.medications.trim() ? (
            <Block title="Current medicines">
              {medicineNames.map((m) => (
                <Text key={m} style={styles.body}>
                  • {m}
                </Text>
              ))}
              {member.medications.trim() ? (
                <Text style={[styles.body, medicineNames.length ? { color: colors.muted, marginTop: 4 } : null]} selectable>
                  {member.medications}
                </Text>
              ) : null}
            </Block>
          ) : null}

          <Block title="Emergency contacts">
            {contacts.length ? (
              contacts.map((c, i) => (
                <View
                  key={`${c.name}-${i}`}
                  style={[styles.row, { paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#F1F5F9' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>
                      {c.name}
                      {c.relation ? <Text style={{ fontWeight: '400', color: colors.muted }}> ({c.relation})</Text> : null}
                    </Text>
                    <Text style={styles.subtitle} selectable>
                      {c.phone || 'No phone number'}
                    </Text>
                  </View>
                  {c.phone ? <CallButton phone={c.phone} label={c.name} /> : null}
                </View>
              ))
            ) : (
              <Pressable onPress={() => router.push({ pathname: '/emergency/edit', params: { memberId } })}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add who to call in an emergency</Text>
              </Pressable>
            )}
          </Block>

          {hasDoctor || hasInsurance ? (
            <Block title="Doctor & insurance">
              {hasDoctor ? (
                <View style={[styles.row, { paddingVertical: 4 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{info!.doctorName || 'Family doctor'}</Text>
                    {info!.doctorPhone ? <Text style={styles.subtitle}>{info!.doctorPhone}</Text> : null}
                  </View>
                  {info!.doctorPhone ? <CallButton phone={info!.doctorPhone} label={info!.doctorName || 'doctor'} /> : null}
                </View>
              ) : null}
              {hasInsurance ? (
                <Text style={[styles.body, { marginTop: hasDoctor ? 8 : 0 }]} selectable>
                  {[info!.insurer, info!.policyNumber ? `Policy ${info!.policyNumber}` : ''].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </Block>
          ) : null}

          {info?.notes.trim() ? (
            <Block title="Notes for responders">
              <Text style={styles.body} selectable>
                {info.notes}
              </Text>
            </Block>
          ) : null}

          <Card style={{ alignItems: 'center', gap: 10 }}>
            <QrCode text={text} size={240} label={`QR code with ${member.name}'s emergency information`} />
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              Any phone camera can scan this to read the card, even without internet or this app.
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} title="Share PDF" icon="document-outline" variant="secondary" loading={sharing} onPress={sharePdf} />
            <Button
              style={{ flex: 1 }}
              title="Share text"
              icon="chatbox-ellipses-outline"
              variant="secondary"
              onPress={() => Share.share({ message: text }).catch(() => {})}
            />
          </View>

          <Card style={{ backgroundColor: '#F8FAFC' }}>
            <Text style={styles.title}>Show it on the lock screen</Text>
            <Text style={[styles.subtitle, { lineHeight: 19 }]}>
              Phones can show medical details to responders without unlocking. On Android open Settings and search for “Medical
              information” (or “Emergency information”); on iPhone use the Health app’s Medical ID. Tap “Share text” to copy these
              details in.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </>
  );
}

/** Red header for the emergency card, with an edit button when a member is shown. */
export function emergencyHeader(memberId: string | null) {
  return {
    title: 'Emergency card',
    headerStyle: { backgroundColor: RED },
    headerTintColor: '#FFFFFF',
    headerTitleStyle: { color: '#FFFFFF' },
    headerRight: memberId
      ? () => (
          <Pressable
            accessibilityLabel="Edit emergency card"
            hitSlop={8}
            style={{ marginRight: 16 }}
            onPress={() => router.push({ pathname: '/emergency/edit', params: { memberId } })}>
            <Icon name="create-outline" size={22} color="#FFFFFF" />
          </Pressable>
        )
      : undefined,
  };
}
