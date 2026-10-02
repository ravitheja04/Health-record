import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GrowthChart } from '@/components/GrowthChart';
import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { ageDays, ageText, GROWTH_KINDS, growthSeries, growthStatus, percentileText, referenceCurves, sexFor, WHO_MAX_DAYS, type GrowthKind } from '@/lib/growth';
import { formatValue } from '@/lib/labAnalysis';
import { useQuery } from '@/lib/useQuery';
import { listVitals } from '@/lib/vitals';
import { vitalDef } from '@/lib/vitalsAnalysis';
import type { VitalType } from '@/lib/types';
import { t } from '@/i18n';

const COLORS: Record<GrowthKind, string> = { weight: '#0891B2', height: '#4F46E5', head: '#CA8A04', bmi: '#7C3AED' };

const STATUS_TEXT = {
  usual: 'In the usual range for age',
  below: 'Below the usual range for age. Worth mentioning at the next check-up.',
  above: 'Above the usual range for age. Worth mentioning at the next check-up.',
  none: '',
};

export default function GrowthScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<GrowthKind>('weight');
  const load = useCallback(async () => ({ member: await getMember(db, memberId), vitals: await listVitals(db, memberId) }), [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const { member, vitals } = data;
  if (!member) return <EmptyState icon="alert-circle-outline" title={t('Member not found')} message={t('This family member may have been deleted.')} />;
  const title = `${member.name.split(' ')[0]} · Growth`;
  if (!member.dob) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="calendar-outline" title={t('Date of birth needed')} message={t('Growth is compared by age. Add the date of birth to this profile first.')}>
          <Button title={t('Edit profile')} icon="create-outline" onPress={() => router.push({ pathname: '/member/edit', params: { id: member.id } })} />
        </EmptyState>
      </>
    );
  }

  const sex = sexFor(member.gender);
  const def = GROWTH_KINDS.find((k) => k.kind === kind)!;
  const points = growthSeries(kind, vitals, member.dob, sex);
  const latest = points[points.length - 1];
  const todayDays = ageDays(member.dob, new Date().toISOString());
  const inWhoAge = Math.min(todayDays, latest?.days ?? todayDays) <= WHO_MAX_DAYS;
  const curves = sex && inWhoAge ? referenceCurves(kind, sex, Math.max(todayDays, latest?.days ?? 0, 180)) : null;
  const statusKey = growthStatus(latest?.z ?? null);
  const status = { text: STATUS_TEXT[statusKey] && t(STATUS_TEXT[statusKey]), color: statusKey === 'usual' ? colors.okText : colors.warnText };
  const logType: VitalType = kind === 'bmi' ? 'height' : kind;
  const add = (type: VitalType = logType) => router.push({ pathname: '/vitals/add', params: { memberId: member.id, type } });
  const kinds = GROWTH_KINDS.filter((k) => k.kind !== 'head' || todayDays <= WHO_MAX_DAYS);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable accessibilityLabel={t('Add a measurement')} hitSlop={8} onPress={() => add()}>
              <Icon name="add-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View role="tablist" style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.subtle, borderRadius: 10, padding: 3 }}>
          {kinds.map((k) => (
            <Pressable
              key={k.kind}
              role="tab"
              accessibilityState={{ selected: k.kind === kind }}
              onPress={() => setKind(k.kind)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: k.kind === kind ? colors.card : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: k.kind === kind ? colors.text : colors.muted }}>{k.label}</Text>
            </Pressable>
          ))}
        </View>

        {latest ? (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text }}>{formatValue(latest.value)}</Text>
              <Text style={{ fontSize: 15, color: colors.muted }}>{def.unit}</Text>
            </View>
            <Text style={styles.subtitle}>
              {t('At')}{' '}{ageText(latest.days)} · {formatDate(latest.measuredAt.slice(0, 10))}
              {latest.percentile !== null ? ` · ${percentileText(latest.percentile)}` : ''}
            </Text>
            {status.text ? <Text style={{ fontWeight: '600', color: status.color }}>{status.text}</Text> : null}

            {points.length ? (
              <View style={{ marginTop: 6 }}>
                <GrowthChart points={points} curves={curves} unit={def.unit} color={COLORS[kind]} />
                {curves ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>{t('— WHO median')}</Text>
                    <Text style={{ fontSize: 12, color: colors.cautionText, fontWeight: '600' }}>{t('- - usual range (±2 SD)')}</Text>
                    <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>{t('··· ±3 SD')}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {!sex ? (
              <Text style={[styles.hint, { lineHeight: 18 }]}>{t('WHO charts differ for boys and girls. Set Male or Female on the profile to compare.')}</Text>
            ) : !inWhoAge ? (
              <Text style={[styles.hint, { lineHeight: 18 }]}>{t('WHO growth standards in the app cover birth to 5 years, so older measurements are shown without reference lines.')}</Text>
            ) : null}
          </Card>
        ) : (
          <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 24 }}>
            <Icon name="resize-outline" size={32} color={colors.muted} />
            <Text style={styles.subtitle}>
              {kind === 'bmi' ? t('BMI needs a weight and a height measured within 30 days of each other.') : t('No {what} measurements yet.', { what: t(def.label).toLowerCase() })}
            </Text>
            <Button title={t('Add {what}', { what: vitalDef(logType).label.toLowerCase() })} icon="add-outline" onPress={() => add()} />
          </Card>
        )}

        {points.length ? (
          <>
            <SectionTitle>{t('All measurements ({n})', { n: points.length })}</SectionTitle>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {[...points].reverse().map((p, i) => (
                <View
                  key={p.measuredAt}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.subtle }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body}>{ageText(p.days)}</Text>
                    <Text style={[styles.subtitle, { marginTop: 0, fontSize: 12 }]}>
                      {formatDate(p.measuredAt.slice(0, 10))}
                      {p.percentile !== null ? ` · ${percentileText(p.percentile)}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: growthStatus(p.z) === 'usual' || growthStatus(p.z) === 'none' ? colors.text : colors.warnStrong }}>
                    {formatValue(p.value)} <Text style={{ fontSize: 12, fontWeight: '500', color: colors.muted }}>{def.unit}</Text>
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button style={{ flex: 1 }} title={t('Add weight')} icon="barbell-outline" variant="secondary" onPress={() => add('weight')} />
          <Button style={{ flex: 1 }} title={t('Add height')} icon="resize-outline" variant="secondary" onPress={() => add('height')} />
        </View>
        {todayDays <= WHO_MAX_DAYS ? <Button title={t('Add head size')} icon="happy-outline" variant="secondary" onPress={() => add('head')} /> : null}
        <Text style={[styles.subtitle, { lineHeight: 18 }]}>
          {t('Compared with the WHO Child Growth Standards (birth to 5 years). Children grow differently; the trend over time says more than one measurement. Your child’s doctor can tell you what’s right for them.')}
        </Text>
      </ScrollView>
    </>
  );
}
