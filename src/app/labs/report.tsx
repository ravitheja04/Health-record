import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReportPicker, SmartReportView } from '@/components/SmartReport';
import { Button, colors, EmptyState, Icon, styles } from '@/components/ui';
import { getMember } from '@/lib/db';
import { listMemberResults } from '@/lib/labs';
import { shareSmartReportPdf } from '@/lib/share';
import { buildSmartReport } from '@/lib/smartReport';
import { showError, useQuery } from '@/lib/useQuery';
import { t } from '@/i18n';

/** One member's smart report; `asOf` opens it as it stood at that lab report. */
export default function SmartReportScreen() {
  const params = useLocalSearchParams<{ memberId: string; asOf?: string }>();
  const { memberId } = params;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [asOf, setAsOf] = useState<string | null>(params.asOf ?? null);
  const [sharing, setSharing] = useState(false);
  const load = useCallback(async () => {
    const [member, points] = await Promise.all([getMember(db, memberId), listMemberResults(db, memberId)]);
    return { member, points };
  }, [db, memberId]);
  const { data } = useQuery(load);

  if (!data) return null;
  const report = buildSmartReport(data.points, asOf);
  // The newest report is "Latest" (null), so the picker shows it selected.
  const asOfValue = asOf && report.allColumns[report.allColumns.length - 1]?.recordId === asOf ? null : asOf;
  const title = data.member ? t('{name}’s smart report', { name: data.member.name.split(' ')[0] }) : t('Smart report');

  if (!report.testCount) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="document-text-outline" title={t('No test results yet')} message={t('Add lab reports to build a smart report of every test from the first report to the latest.')}>
          <Button title={t('Read a lab report PDF')} icon="scan-outline" onPress={() => router.push({ pathname: '/record/import', params: { memberId } })} />
        </EmptyState>
      </>
    );
  }

  async function share() {
    setSharing(true);
    try {
      await shareSmartReportPdf(db, memberId, asOfValue);
    } catch (e) {
      showError(t('Could not share'), e);
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable accessibilityLabel={t('Share as PDF')} hitSlop={8} onPress={share} disabled={sharing}>
              <Icon name="share-outline" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <ReportPicker report={report} value={asOfValue} onChange={setAsOf} />
        <SmartReportView key={asOfValue ?? 'latest'} report={report} memberId={memberId} />
        <Button title={t('Share as PDF')} icon="document-outline" variant="secondary" loading={sharing} onPress={share} />
      </ScrollView>
    </>
  );
}
